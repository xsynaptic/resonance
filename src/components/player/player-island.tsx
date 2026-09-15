import type { PlayerLabels, PlayerUrls, QueueItem } from '@xsynaptic/player';

import {
	AudioPlayer,
	bindMediaSession,
	currentCue,
	loadedItem,
	playerStore,
} from '@xsynaptic/player';
import { useEffect } from 'react';

import type { PlayerPayloadItem } from '#lib/collections/mixes/mixes-queue.ts';

import {
	controlSelector,
	heldPressAttribute,
	heldPressSelector,
	listeningEvent,
} from '#components/player/player-held-press.ts';

const streamType = 'audio/webm; codecs="opus"';

// Both URLs come from the payload, so neither resolver touches the network
const urls: PlayerUrls = {
	archive: (item) => Promise.resolve(payloadUrl(item, 'archiveUrl')),
	stream: (item) => {
		const streamUrl = payloadUrl(item, 'streamUrl');
		if (streamUrl === undefined) {
			return Promise.reject(new Error(`No stream URL for ${item.trackId}`));
		}

		return Promise.resolve({ status: 'ok', type: streamType, url: streamUrl });
	},
};

let parsedSource: string | undefined;
let parsedItems: Array<PlayerPayloadItem> | undefined;

interface RowState {
	cueStartSeconds: number | undefined;
	isPlaying: boolean;
	trackId: string | undefined;
}

export function PlayerIsland({
	isOverlayEnabled,
	labels,
	skipSeconds,
}: {
	isOverlayEnabled: boolean;
	labels: PlayerLabels;
	skipSeconds: number;
}) {
	useEffect(() => bindMediaSession(playerStore, skipSeconds), [skipSeconds]);

	// Without `moveBefore` the router moves the persisted island out and back, which drops the dialog's modal state
	useEffect(() => {
		const onBeforePreparation = (): void => {
			playerStore.getState().setOverlayOpen(false);
		};

		document.addEventListener('astro:before-preparation', onBeforePreparation);

		return () => {
			document.removeEventListener('astro:before-preparation', onBeforePreparation);
		};
	}, []);

	// A queue restored from storage can predate this build; a press on a track already queued jumps to the stored copy
	useEffect(() => {
		const refreshQueue = (): void => {
			const items = readPayload();
			if (items) playerStore.getState().refreshQueue(items);
		};

		refreshQueue();
		document.addEventListener('astro:after-swap', refreshQueue);

		return () => {
			document.removeEventListener('astro:after-swap', refreshQueue);
		};
	}, []);

	// One delegated listener, so pages ship no player script and survive the client router's scripts-run-once model
	useEffect(() => {
		const onClick = (event: MouseEvent): void => {
			dispatchControl(event.target instanceof Element ? event.target : undefined);
		};

		document.addEventListener('click', onClick);
		// The directive stops holding presses on this event, so the held one lands exactly once
		document.dispatchEvent(new Event(listeningEvent));
		replayHeldPress();

		return () => {
			document.removeEventListener('click', onClick);
		};
	}, []);

	// Guarded on track and transport change so the clock's updates do not rescan the DOM; re-marked after each soft navigation
	useEffect(() => {
		let applied = currentRowState();

		markRows(applied);

		const unsubscribe = playerStore.subscribe(() => {
			const rowState = currentRowState();
			if (isSameRowState(rowState, applied)) return;

			applied = rowState;
			markRows(rowState);
		});
		// Page load fires after the transition animates in, so marking there flashes the stale state
		const onAfterSwap = (): void => {
			markRows(currentRowState());
		};

		document.addEventListener('astro:after-swap', onAfterSwap);

		return () => {
			unsubscribe();
			document.removeEventListener('astro:after-swap', onAfterSwap);
		};
	}, []);

	return (
		<AudioPlayer
			isOverlayEnabled={isOverlayEnabled}
			labels={labels}
			skipSeconds={skipSeconds}
			urls={urls}
		/>
	);
}

function currentRowState(): RowState {
	const state = playerStore.getState();

	// Intent rather than sound, matching the bar's play button
	return {
		cueStartSeconds: currentCue(state)?.startSeconds,
		isPlaying: state.isPlayIntended,
		trackId: loadedItem(state)?.trackId,
	};
}

// The nearest verb wins, so a track's own control beats a play-all wrapping it
function dispatchControl(target: Element | undefined): void {
	const control = target?.closest<HTMLElement>(controlSelector);
	if (!control) return;

	const items = readPayload();
	if (!items) return;

	const store = playerStore.getState();
	const { playQueue, playRelease, playTrack, queueTrack } = control.dataset;

	if (playQueue !== undefined) {
		store.playQueue(stationItems(playQueue, items));
		return;
	}

	if (queueTrack) {
		store.queueTrack(items, queueTrack);
		return;
	}

	if (playTrack) {
		store.playTrack(items, playTrack);
		return;
	}

	if (playRelease !== undefined) store.playRelease(items);
}

function isSameRowState(first: RowState, second: RowState): boolean {
	return (
		first.trackId === second.trackId &&
		first.isPlaying === second.isPlaying &&
		first.cueStartSeconds === second.cueStartSeconds
	);
}

function markRows({ cueStartSeconds, isPlaying, trackId }: RowState): void {
	for (const row of document.querySelectorAll<HTMLElement>('[data-track-id]')) {
		const isLoaded = trackId !== undefined && row.dataset.trackId === trackId;

		row.toggleAttribute('data-loaded', isLoaded);
		row.toggleAttribute('data-playing', isLoaded && isPlaying);
	}

	for (const list of document.querySelectorAll<HTMLElement>('[data-cue-mix]')) {
		const isLoaded = trackId !== undefined && list.dataset.cueMix === trackId;

		for (const row of list.querySelectorAll<HTMLElement>('[data-cue-seconds]')) {
			row.toggleAttribute(
				'data-cue-current',
				isLoaded && Number(row.dataset.cueSeconds) === cueStartSeconds,
			);
		}
	}
}

// Every item this island queues is a payload item, and the store keeps its fields through a reload
function payloadUrl(item: QueueItem, field: 'archiveUrl' | 'streamUrl'): string | undefined {
	const value: unknown = Reflect.get(item, field);

	return typeof value === 'string' ? value : undefined;
}

// Parsed once per payload rather than once per click; the string changes with each soft navigation
function readPayload(): Array<PlayerPayloadItem> | undefined {
	const payload =
		document.querySelector<HTMLElement>('[data-player-payload]')?.dataset.playerPayload;
	if (!payload) return undefined;
	if (payload === parsedSource) return parsedItems;

	parsedSource = payload;

	try {
		parsedItems = JSON.parse(payload) as Array<PlayerPayloadItem>;
	} catch {
		parsedItems = undefined;
	}

	return parsedItems;
}

function replayHeldPress(): void {
	const held = document.querySelector(heldPressSelector);
	if (!held) return;

	held.removeAttribute(heldPressAttribute);
	dispatchControl(held);
}

function stationItems(
	ids: string,
	items: ReadonlyArray<PlayerPayloadItem>,
): Array<PlayerPayloadItem> {
	return ids
		.split(' ')
		.map((trackId) => items.find((item) => item.trackId === trackId))
		.filter((item) => item !== undefined);
}
