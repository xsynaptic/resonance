import type {
	CreateAudioEngine,
	createPlayerStore,
	PlayerUrls,
	QueueItem,
} from '@xsynaptic/player';

import type { PlayerPayloadItem } from '#lib/collections/mixes/mixes-queue.ts';

type SpecimenStore = ReturnType<typeof createPlayerStore>;

const silentAnalyser: AnalyserNode | undefined = undefined;

// A browser refuses an audio graph outside a gesture, so the specimens stand at the engine seam instead
export const createSilentEngine: CreateAudioEngine = (callbacks) => {
	let currentTimeSeconds = 0;

	return {
		analyser: () => silentAnalyser,
		canPlay: () => true,
		currentTime: () => currentTimeSeconds,
		load: () => {
			callbacks.onStatus('paused');

			return Promise.resolve();
		},
		// No graph, so nothing stands between the clock and the sound
		outputDelay: () => 0,
		pause: () => {
			callbacks.onStatus('paused');
		},
		play: () => Promise.resolve(),
		prepare: () => {
			// No graph to build
		},
		reset: () => {
			currentTimeSeconds = 0;
		},
		seek: (seconds) => {
			currentTimeSeconds = seconds;
		},
		setVolume: () => {
			// No gain stage to drive
		},
	};
};

// Holds every load and every play short of sound, so the play button's ring stays on screen
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

// Cued and paused, as a listener leaves it; the ring belongs to the loading specimen alone
export function cueFirstPaused(store: SpecimenStore): void {
	store.getState().playAt(0);
	store.getState().pause();
}

export const failingUrls: PlayerUrls = {
	stream: () => Promise.reject(new Error('Inventory specimen: no stream')),
};

export function pendingUrls(items: ReadonlyArray<PlayerPayloadItem>): PlayerUrls {
	return {
		...queuedUrls(items),
		archive: () =>
			new Promise<string | undefined>(() => {
				// Never answers, so the panel holds on its placeholder
			}),
	};
}

// Any id resolves: the tray specimen synthesizes its own to get distinct rows, and a specimen shows layout rather than resolution
export function queuedUrls(items: ReadonlyArray<PlayerPayloadItem>): PlayerUrls {
	const find = (trackId: string) => items.find((queued) => queued.trackId === trackId) ?? items[0];

	return {
		archive: ({ trackId }) => Promise.resolve(find(trackId)?.archiveUrl),
		stream: ({ trackId }) => {
			const item = find(trackId);
			if (!item) return Promise.reject(new Error(`No stream URL for ${trackId}`));

			return Promise.resolve({ status: 'ok', url: item.streamUrl });
		},
	};
}

// Long enough to overflow the info window in either layout, so both lines are always marching
const marqueeArtist = 'Basilisk, with Nebula Drift, Forest Signal and the Ektoplazm Sound System';
const marqueeTitle = 'Deep Forest Transmissions From The Edge Of A Very Long Winter Night';

export function marqueed(items: ReadonlyArray<PlayerPayloadItem>): Array<QueueItem> {
	const [first, ...rest] = items;
	if (!first) return [...items];

	return [{ ...first, artistLine: marqueeArtist, title: marqueeTitle }, ...rest];
}

// The archive cache is keyed by track, so the real archive elsewhere on the page must not answer for this one
export function pendingPanelQueue(items: ReadonlyArray<PlayerPayloadItem>): Array<QueueItem> {
	return items.slice(0, 1).map((item) => ({ ...item, trackId: 'inventory-panel-pending' }));
}

// A queue carrying any heading cannot shuffle
export function sectioned(items: ReadonlyArray<PlayerPayloadItem>): Array<QueueItem> {
	return items.map((item) => ({
		...item,
		sectionLabel: item.waveformOverview ? 'Measured peaks' : 'No measured peaks',
	}));
}

export function withoutArtwork(items: ReadonlyArray<PlayerPayloadItem>): Array<QueueItem> {
	return items.map(({ artwork: _artwork, ...item }) => item);
}

// Enough rows to scroll, at title lengths that show both the two-line row and where it truncates
const trayTitles = [
	'Mountain Calling',
	'Nightfall Over The Northern Cordillera, An Extended Transmission For The Long Dark',
	'Drift',
	'Deep Forest Transmissions',
	'Signal Path',
	'The Ektoplazm Sound System Presents An Autumn Selection',
	'Reclaim',
];

export function trayQueue(items: ReadonlyArray<PlayerPayloadItem>): Array<QueueItem> {
	const first = items[0];
	if (!first) return [];

	return trayTitles.map((title, index) => ({
		...(items[index % items.length] ?? first),
		title,
		trackId: `inventory-tray-${String(index)}`,
	}));
}
