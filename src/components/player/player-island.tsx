import type { PlayerLabels, PlayerUrls } from '@xsynaptic/player';

import { AudioPlayer, bindMediaSession, playerStore } from '@xsynaptic/player';
import { useEffect } from 'react';

import type { PlayerPayloadItem } from '#lib/collections/mixes/mixes-queue.ts';

const streamType = 'audio/webm; codecs="opus"';

// Both URLs come from the payload, so neither resolver touches the network
const urls: PlayerUrls = {
	archive: (trackId) => Promise.resolve(resolve(trackId, 'archiveUrl')),
	stream: (trackId) => {
		const streamUrl = resolve(trackId, 'streamUrl');
		if (streamUrl === undefined) return Promise.reject(new Error(`No stream URL for ${trackId}`));

		return Promise.resolve({ status: 'ok', type: streamType, url: streamUrl });
	},
};

let parsedSource: string | undefined;
let parsedItems: Array<PlayerPayloadItem> | undefined;

// Kept across soft navigations: a queue outlives the page it was built from, and the next page's payload need not carry it
const payloadItems = new Map<string, PlayerPayloadItem>();

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
	useEffect(() => bindMediaSession(playerStore), []);

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

	// One delegated listener, so pages ship no player script and survive the client router's scripts-run-once model
	useEffect(() => {
		const onClick = (event: MouseEvent): void => {
			dispatchControl(event.target instanceof Element ? event.target : undefined);
		};

		document.addEventListener('click', onClick);

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
	const { currentIndex, currentTimeSeconds, isPlayIntended, queue } = playerStore.getState();
	const item = currentIndex === undefined ? undefined : queue[currentIndex];
	const cuePoints = item?.cuePoints ?? [];
	let cueStartSeconds: number | undefined;

	for (const cue of cuePoints) {
		if (cue.startSeconds > currentTimeSeconds) break;

		cueStartSeconds = cue.startSeconds;
	}

	// Intent rather than sound, matching the bar's play button
	return { cueStartSeconds, isPlaying: isPlayIntended, trackId: item?.trackId };
}

// The nearest verb wins, so a track's own control beats a play-all wrapping it
function dispatchControl(target: Element | undefined): void {
	const control = target?.closest<HTMLElement>(
		'[data-queue-track],[data-play-track],[data-play-release],[data-play-queue]',
	);
	if (!control) return;

	const items = readPayload();
	if (!items) return;

	const store = playerStore.getState();
	const { playQueue, playRelease, playTrack, queueTrack } = control.dataset;

	if (playQueue !== undefined) {
		store.playQueue(stationItems(playQueue));
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

// Parsed once per payload rather than once per click; the string changes with each soft navigation
function readPayload(): Array<PlayerPayloadItem> | undefined {
	const payload =
		document.querySelector<HTMLElement>('[data-player-payload]')?.dataset.playerPayload;
	if (!payload) return undefined;
	if (payload === parsedSource) return parsedItems;

	parsedSource = payload;

	try {
		parsedItems = JSON.parse(payload) as Array<PlayerPayloadItem>;

		for (const item of parsedItems) payloadItems.set(item.trackId, item);
	} catch {
		parsedItems = undefined;
	}

	return parsedItems;
}

// A restored queue keeps the payload's fields, so a track queued on another page still resolves
function resolve(trackId: string, field: 'archiveUrl' | 'streamUrl'): string | undefined {
	const item =
		payloadItems.get(trackId) ??
		(playerStore.getState().queue.find((queued) => queued.trackId === trackId) as
			Partial<PlayerPayloadItem> | undefined);

	return item?.[field];
}

function stationItems(ids: string): Array<PlayerPayloadItem> {
	return ids
		.split(' ')
		.map((trackId) => payloadItems.get(trackId))
		.filter((item) => item !== undefined);
}
