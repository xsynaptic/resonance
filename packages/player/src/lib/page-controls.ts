import type { StoreApi } from 'zustand/vanilla';

import type { PlayerStore } from '#store/player-types.ts';
import type { QueueItem } from '#types.ts';

import { bind } from '#lib/bind.ts';
import {
	controlSelector,
	heldPressAttribute,
	heldPressSelector,
	payloadSelector,
} from '#lib/page-control-selectors.ts';
import { currentCue, loadedItem } from '#store/selectors.ts';

interface RowState {
	cueStartSeconds: number | undefined;
	isPlaying: boolean;
	trackId: string | undefined;
}

// One delegated listener, so pages ship no player script and survive the client router's scripts-run-once model
export function bindPageControls(store: StoreApi<PlayerStore>, page: Document): () => void {
	const connection = new AbortController();
	const { signal } = connection;
	const readPayload = payloadReader(page);

	const dispatchControl = (target: Element | undefined): void => {
		const control = target?.closest<HTMLElement>(controlSelector);
		const items = control ? readPayload() : undefined;
		if (!control || !items) return;

		pressControl(store.getState(), control.dataset, items);
	};

	// A queue restored from storage can predate this build; a press on a track already queued jumps to the stored copy
	const refreshQueue = (): void => {
		const items = readPayload();
		if (items) store.getState().refreshQueue(items);
	};

	refreshQueue();
	// Page load fires after the transition animates in, so marking there flashes the stale state
	page.addEventListener(
		'astro:after-swap',
		() => {
			refreshQueue();
			markRows(page, selectRowState(store.getState()));
		},
		{ signal },
	);
	bind(
		store,
		selectRowState,
		(rowState) => {
			markRows(page, rowState);
		},
		signal,
	);
	page.addEventListener(
		'click',
		(event) => {
			dispatchControl(event.target instanceof Element ? event.target : undefined);
		},
		{ signal },
	);

	const held = page.querySelector(heldPressSelector);

	held?.removeAttribute(heldPressAttribute);
	dispatchControl(held ?? undefined);

	return () => {
		connection.abort();
	};
}

function markRows(page: Document, { cueStartSeconds, isPlaying, trackId }: RowState): void {
	for (const row of page.querySelectorAll<HTMLElement>('[data-track-id]')) {
		const isLoaded = trackId !== undefined && row.dataset.trackId === trackId;

		row.toggleAttribute('data-loaded', isLoaded);
		row.toggleAttribute('data-playing', isLoaded && isPlaying);
	}

	for (const list of page.querySelectorAll<HTMLElement>('[data-cue-mix]')) {
		const isLoaded = trackId !== undefined && list.dataset.cueMix === trackId;

		for (const row of list.querySelectorAll<HTMLElement>('[data-cue-seconds]')) {
			row.toggleAttribute(
				'data-cue-current',
				isLoaded && Number(row.dataset.cueSeconds) === cueStartSeconds,
			);
		}
	}
}

// Parsed once per payload rather than once per click; the string changes with each soft navigation
function payloadReader(page: Document): () => Array<QueueItem> | undefined {
	let parsedSource: string | undefined;
	let parsedItems: Array<QueueItem> | undefined;

	return () => {
		const payload = page.querySelector<HTMLElement>(payloadSelector)?.dataset.playerPayload;
		if (!payload) return;
		if (payload === parsedSource) return parsedItems;

		parsedSource = payload;

		try {
			parsedItems = JSON.parse(payload) as Array<QueueItem>;
		} catch {
			parsedItems = undefined;
		}

		return parsedItems;
	};
}

// The nearest verb wins, so a track's own control beats a play-all wrapping it
function pressControl(state: PlayerStore, verbs: DOMStringMap, items: Array<QueueItem>): void {
	const { playQueue, playRelease, playTrack, queueTrack } = verbs;

	if (playQueue !== undefined) {
		state.playQueue(stationItems(playQueue, items));
		return;
	}

	if (queueTrack) {
		state.queueTrack(items, queueTrack);
		return;
	}

	if (playTrack) {
		state.playTrack(items, playTrack);
		return;
	}

	if (playRelease !== undefined) state.playRelease(items);
}

// Intent rather than sound, matching the bar's play button
function selectRowState(state: PlayerStore): RowState {
	return {
		cueStartSeconds: currentCue(state)?.startSeconds,
		isPlaying: !state.isPaused,
		trackId: loadedItem(state)?.trackId,
	};
}

function stationItems(ids: string, items: ReadonlyArray<QueueItem>): Array<QueueItem> {
	return ids
		.split(' ')
		.map((trackId) => items.find((item) => item.trackId === trackId))
		.filter((item) => item !== undefined);
}
