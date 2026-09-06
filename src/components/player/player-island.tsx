import type { PlayerLabels, PlayerUrls } from '@xsynaptic/player';

import { AudioPlayer, bindMediaSession, playerStore } from '@xsynaptic/player';
import { useEffect } from 'react';

import type { PlayerPayloadItem } from '#lib/collections/mixes/mixes-queue.ts';

// Every stream URL is already in a payload and the manifest's peaks are the whole seek bar, so neither resolver touches the network
// The archive is the exception: the panel range-requests it, and under `pnpm dev` a local route serves it
const urls: PlayerUrls = {
	archive: (trackId) =>
		Promise.resolve(
			import.meta.env.DEV ? `/waveform/${encodeURIComponent(trackId)}.dat` : undefined,
		),
	stream: (trackId) => {
		const streamUrl = streamUrls.get(trackId) ?? queuedStreamUrl(trackId);
		if (streamUrl === undefined) return Promise.reject(new Error(`No stream URL for ${trackId}`));

		return Promise.resolve({ status: 'ok', url: streamUrl });
	},
	waveform: () => Promise.resolve(undefined),
};

let parsedSource: string | undefined;
let parsedItems: Array<PlayerPayloadItem> | undefined;

// Kept across soft navigations: a queue outlives the page it was built from, and the next page's payload need not carry it
const streamUrls = new Map<string, string>();

export function PlayerIsland({
	labels,
	skipSeconds,
}: {
	labels: PlayerLabels;
	skipSeconds: number;
}) {
	useEffect(() => bindMediaSession(playerStore), []);

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

	// Guarded on track change so the clock's updates do not rescan the DOM; re-marked after each soft navigation
	useEffect(() => {
		let applied = currentTrackId();

		markRows(applied);

		const unsubscribe = playerStore.subscribe(() => {
			const trackId = currentTrackId();
			if (trackId === applied) return;

			applied = trackId;
			markRows(trackId);
		});
		const onPageLoad = (): void => {
			markRows(currentTrackId());
		};

		document.addEventListener('astro:page-load', onPageLoad);

		return () => {
			unsubscribe();
			document.removeEventListener('astro:page-load', onPageLoad);
		};
	}, []);

	return <AudioPlayer labels={labels} skipSeconds={skipSeconds} urls={urls} />;
}

function currentTrackId(): string | undefined {
	const { currentIndex, queue } = playerStore.getState();
	if (currentIndex === undefined) return undefined;

	return queue[currentIndex]?.trackId;
}

// The nearest verb wins, so a track's own control beats a play-all wrapping it
function dispatchControl(target: Element | undefined): void {
	const control = target?.closest<HTMLElement>(
		'[data-queue-track],[data-play-track],[data-play-release]',
	);
	if (!control) return;

	const items = readPayload();
	if (!items) return;

	const store = playerStore.getState();
	const { playRelease, playTrack, queueTrack } = control.dataset;

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

function markRows(trackId: string | undefined): void {
	for (const row of document.querySelectorAll<HTMLElement>('[data-track-id]')) {
		row.toggleAttribute('data-playing', trackId !== undefined && row.dataset.trackId === trackId);
	}
}

// A restored queue keeps the payload's own fields, so a track queued on a page this session never opened still resolves
function queuedStreamUrl(trackId: string): string | undefined {
	const queued = playerStore.getState().queue.find((item) => item.trackId === trackId);

	return (queued as Partial<PlayerPayloadItem> | undefined)?.streamUrl;
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

		for (const item of parsedItems) streamUrls.set(item.trackId, item.streamUrl);
	} catch {
		parsedItems = undefined;
	}

	return parsedItems;
}
