import type { StoreApi } from 'zustand/vanilla';

import type { PlayerStore } from '#store/player-types.ts';
import type { QueueItem } from '#types.ts';

import {
	controlSelector,
	heldPressAttribute,
	heldPressSelector,
	payloadSelector,
} from '#constants.ts';
import { bind } from '#lib/bind.ts';
import { currentCue, loadedItem } from '#store/selectors.ts';

// The resolved press, so a host reads the verb rather than re-deriving it from the DOM
export interface ControlPress {
	itemIds: Array<string>;
	verb: 'play-playlist' | 'play-release' | 'play-track' | 'queue-track' | 'toggle-playlist';
}

interface PageControlOptions {
	onPress?: ((press: ControlPress) => void) | undefined;
}

interface RowState {
	cueStartSeconds: number | undefined;
	isPlaying: boolean;
	itemId: string | undefined;
	queuedIds: string;
}

// One delegated listener, so pages ship no player script and survive the client router's scripts-run-once model
export function bindPageControls(
	store: StoreApi<PlayerStore>,
	page: Document,
	{ onPress }: PageControlOptions = {},
): () => void {
	const connection = new AbortController();
	const { signal } = connection;
	const readPayload = payloadReader(page);

	const dispatchControl = (target: Element | undefined): void => {
		const control = target?.closest<HTMLElement>(controlSelector);
		const items = control ? readPayload() : undefined;
		if (!control || !items) return;

		const press = pressControl(store.getState(), control.dataset, items);

		if (press) onPress?.(press);
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

function isTunedIn(playlistIds: string, itemId: string | undefined): boolean {
	return itemId !== undefined && playlistIds.split(' ').includes(itemId);
}

function markCueRows(page: Document, { cueStartSeconds, itemId }: RowState): void {
	for (const list of page.querySelectorAll<HTMLElement>('[data-cue-mix]')) {
		const isLoaded = itemId !== undefined && list.dataset.cueMix === itemId;

		for (const row of list.querySelectorAll<HTMLElement>('[data-cue-seconds]')) {
			row.toggleAttribute(
				'data-cue-current',
				isLoaded && Number(row.dataset.cueSeconds) === cueStartSeconds,
			);
		}
	}
}

function markPlaylists(page: Document, { isPlaying, itemId }: RowState): void {
	for (const playlist of page.querySelectorAll<HTMLElement>('[data-play-playlist]')) {
		playlist.toggleAttribute(
			'data-playing',
			isPlaying && isTunedIn(playlist.dataset.playPlaylist ?? '', itemId),
		);
	}
}

function markRows(page: Document, state: RowState): void {
	markTrackRows(page, state);
	markCueRows(page, state);
	markPlaylists(page, state);
}

function markTrackRows(page: Document, { isPlaying, itemId, queuedIds }: RowState): void {
	const queued = new Set(queuedIds.split(' '));

	for (const row of page.querySelectorAll<HTMLElement>('[data-track-id]')) {
		const { trackId } = row.dataset;
		const isLoaded = itemId !== undefined && trackId === itemId;
		const isQueued = trackId !== undefined && queued.has(trackId);

		row.toggleAttribute('data-loaded', isLoaded);
		row.toggleAttribute('data-playing', isLoaded && isPlaying);
		row.toggleAttribute('data-queued', isQueued);

		// The verb only adds, so a queued Mix leaves the button nothing to do
		for (const button of row.querySelectorAll<HTMLButtonElement>('[data-queue-track]')) {
			button.disabled = isQueued;
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

function playlistItems(ids: string, items: ReadonlyArray<QueueItem>): Array<QueueItem> {
	return ids
		.split(' ')
		.map((itemId) => items.find((item) => item.itemId === itemId))
		.filter((item) => item !== undefined);
}

// The nearest verb wins, so a track's own control beats a play-all wrapping it
function pressControl(
	state: PlayerStore,
	verbs: DOMStringMap,
	items: Array<QueueItem>,
): ControlPress | undefined {
	const { playPlaylist, playRelease, playTrack, queueTrack } = verbs;

	if (playPlaylist !== undefined && isTunedIn(playPlaylist, loadedItem(state)?.itemId)) {
		state.togglePaused();

		return { itemIds: playPlaylist.split(' '), verb: 'toggle-playlist' };
	}

	if (playPlaylist !== undefined) {
		const playlist = playlistItems(playPlaylist, items);

		state.playQueue(playlist);

		return { itemIds: playlist.map((item) => item.itemId), verb: 'play-playlist' };
	}

	if (queueTrack) {
		state.queueTrack(items, queueTrack);

		return { itemIds: [queueTrack], verb: 'queue-track' };
	}

	if (playTrack) {
		state.playTrack(items, playTrack);

		return { itemIds: [playTrack], verb: 'play-track' };
	}

	if (playRelease === undefined) return undefined;

	state.playRelease(items);

	return { itemIds: items.map((item) => item.itemId), verb: 'play-release' };
}

// Intent rather than sound, matching the bar's play button
function selectRowState(state: PlayerStore): RowState {
	return {
		cueStartSeconds: currentCue(state)?.startSeconds,
		isPlaying: !state.isPaused,
		itemId: loadedItem(state)?.itemId,
		queuedIds: state.queue.map((item) => item.itemId).join(' '),
	};
}
