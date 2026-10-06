import type { CreateAudioEngine, PlayerStoreApi, PlayerUrls, QueueItem } from '@xsynaptic/player';

import type { MixQueueItem, PlayerPressRow } from '#lib/collections/mixes/mixes-queue.ts';

// A browser refuses playback outside a gesture, so the specimens stand at the engine seam instead
export const createSilentEngine: CreateAudioEngine = (callbacks) => {
	let currentTimeSeconds = 0;

	return {
		canPlay: () => true,
		currentTime: () => currentTimeSeconds,
		element: document.createElement('audio'),
		load: () => {
			callbacks.onStatus('paused');

			return Promise.resolve();
		},
		pause: () => {
			callbacks.onStatus('paused');
		},
		play: () => Promise.resolve(),
		reset: () => {
			currentTimeSeconds = 0;
		},
		seek: (seconds) => {
			currentTimeSeconds = seconds;
		},
		setMuted: () => {
			// Nothing sounds, so nothing to silence
		},
		setVolume: () => {
			// No element to drive
		},
	};
};

export const createLoadingEngine: CreateAudioEngine = (callbacks) => ({
	...createSilentEngine(callbacks),
	load: () => {
		callbacks.onStatus('loading');

		return new Promise<void>(() => {
			// Never settles
		});
	},
	play: () => {
		callbacks.onStatus('loading');

		return Promise.resolve();
	},
});

export function cueFirstPaused(store: PlayerStoreApi): void {
	store.getState().playAt(0);
	store.getState().pause();
}

export const failingUrls: PlayerUrls = {
	stream: () => Promise.reject(new Error('Inventory specimen: no stream')),
};

// This page answers a range request with a 200, so no chunk lands and the panel holds on its placeholder
const pendingArchiveUrl = '/inventory/player/';

export function pendingUrls(items: ReadonlyArray<MixQueueItem>): PlayerUrls {
	const urls = queuedUrls(items);

	return {
		...urls,
		detail: async (item) => {
			const detail = await urls.detail?.(item);
			if (!detail?.archive) return detail;

			return { ...detail, archive: { ...detail.archive, url: pendingArchiveUrl } };
		},
	};
}

// Any id resolves: the tray specimen synthesizes its own to get distinct rows, and a specimen shows layout rather than resolution
export function queuedUrls(items: ReadonlyArray<MixQueueItem>): PlayerUrls {
	const find = (itemId: string) => items.find(({ press }) => press.itemId === itemId) ?? items[0];

	return {
		detail: ({ itemId }) => Promise.resolve(find(itemId)?.detail),
		stream: ({ itemId }) => {
			const item = find(itemId);
			if (!item) return Promise.reject(new Error(`No stream URL for ${itemId}`));

			return Promise.resolve({ status: 'ok', url: item.press.streamUrl });
		},
	};
}

const marqueeArtist = 'Basilisk, with Nebula Drift, Forest Signal and the Ektoplazm Sound System';
const marqueeTitle = 'Deep Forest Transmissions From The Edge Of A Very Long Winter Night';

export function marqueed(items: ReadonlyArray<PlayerPressRow>): Array<QueueItem> {
	const [first, ...rest] = items;
	if (!first) return [...items];

	return [{ ...first, artistLine: marqueeArtist, title: marqueeTitle }, ...rest];
}

export function withoutArtwork(items: ReadonlyArray<PlayerPressRow>): Array<QueueItem> {
	return items.map(({ artwork: _artwork, ...item }) => item);
}

const trayTitles = [
	'Mountain Calling',
	'Nightfall Over The Northern Cordillera, An Extended Transmission For The Long Dark',
	'Drift',
	'Deep Forest Transmissions',
	'Signal Path',
	'The Ektoplazm Sound System Presents An Autumn Selection',
	'Reclaim',
];

export function trayQueue(items: ReadonlyArray<PlayerPressRow>): Array<QueueItem> {
	const first = items[0];
	if (!first) return [];

	return trayTitles.map((title, index) => ({
		...(items[index % items.length] ?? first),
		itemId: `inventory-tray-${String(index)}`,
		title,
	}));
}
