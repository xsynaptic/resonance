import type { PlayerStoreApi, PlayerUrls, Track } from '@xsynaptic/plazmoid-core';
import type { PlayerLabels } from '@xsynaptic/plazmoid-player';
import type { AstroPlayerConfig } from '@xsynaptic/plazmoid-player/astro';

import type { MixQueueItem } from '#lib/collections/mixes/mixes-queue.ts';

interface PlayerBarConfig {
	labels: PlayerLabels;
	libraryUrl: string;
	seekSeconds: number;
	stylesheetUrl: string;
}

// The MP4 sample entry code, capital included; Safari answers the lowercase spelling with an empty string
const streamType = 'audio/mp4; codecs="Opus"';

const libraryTimeoutMs = 10_000;

type Library = Map<string, MixQueueItem>;

export function configurePlayer(host: Element): AstroPlayerConfig {
	const { labels, libraryUrl, seekSeconds, stylesheetUrl } = readConfig(host);
	const loadLibrary = createLibraryLoader(libraryUrl);
	let prefetched: Promise<Library | undefined> | undefined;

	return {
		load: async () => {
			prefetched = prefetchLibrary(loadLibrary);

			const [{ bindPlayerStats }, { bindPlayerAnalytics, trackControlPress }] = await Promise.all([
				import('#components/player/player-stats.ts'),
				import('#components/player/player-analytics.ts'),
			]);

			return {
				onPress: trackControlPress,
				onReady: ({ store, view }) => {
					void bindPlayerStats(store);
					bindPlayerAnalytics(store, view);
				},
			};
		},
		player: { isScopeEnabled: true, labels, seekSeconds },
		stylesheetUrl,
		urls: (store) => {
			const refreshQueue = queueRefresher(store);

			void prefetched?.then((library) => {
				if (library) refreshQueue(library);
			});

			return libraryUrls(async () => {
				const library = await loadLibrary();

				refreshQueue(library);

				return library;
			});
		},
	};
}

// A stored Queue catches up on any page, its content-hashed stream and artwork URLs included
function queueRefresher(store: PlayerStoreApi): (library: Library) => void {
	let hasRefreshed = false;

	return (library) => {
		if (hasRefreshed) return;

		hasRefreshed = true;
		store.getState().refreshQueue([...library.values()].map(({ press }) => press));
	};
}

// The stream comes from the press row, so a press never waits on the Library
function libraryUrls(loadLibrary: () => Promise<Library>): PlayerUrls {
	return {
		detail: async ({ trackId }) => {
			const library = await loadLibrary();

			return library.get(trackId)?.detail;
		},
		stream: (item) => {
			const streamUrl = pressRowStreamUrl(item);
			if (streamUrl === undefined) {
				return Promise.reject(new Error(`No stream URL for ${item.trackId}`));
			}

			return Promise.resolve({ sources: [{ type: streamType, url: streamUrl }], status: 'ok' });
		},
	};
}

function createLibraryLoader(url: string): () => Promise<Library> {
	let request: Promise<Library> | undefined;

	async function load(): Promise<Library> {
		try {
			return await fetchLibrary(url);
		} catch (error) {
			request = undefined;
			throw error;
		}
	}

	return () => {
		if (!request) request = load();

		return request;
	};
}

async function prefetchLibrary(loadLibrary: () => Promise<Library>): Promise<Library | undefined> {
	try {
		return await loadLibrary();
	} catch {
		return undefined;
	}
}

async function fetchLibrary(url: string): Promise<Library> {
	const response = await fetch(url, { signal: AbortSignal.timeout(libraryTimeoutMs) });
	if (!response.ok) throw new Error(`The Library answered ${String(response.status)}`);

	const entries = (await response.json()) as Array<MixQueueItem>;

	return new Map(entries.map((entry) => [entry.press.trackId, entry]));
}

// Every item this host queues is a press row, and the store keeps its fields through a reload
function pressRowStreamUrl(item: Track): string | undefined {
	const value: unknown = Reflect.get(item, 'streamUrl');

	return typeof value === 'string' ? value : undefined;
}

function readConfig(host: Element): PlayerBarConfig {
	const source = host.querySelector('script[type="application/json"]')?.textContent;
	if (!source) throw new Error('The player host carries no script of labels and options');

	return JSON.parse(source) as PlayerBarConfig;
}
