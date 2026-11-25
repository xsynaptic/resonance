import type { PlayerStoreApi, PlayerUrls } from '@xsynaptic/plazmoid-core';
import type { PlayerLabels } from '@xsynaptic/plazmoid-player';
import type { AstroPlayerConfig } from '@xsynaptic/plazmoid-player/astro';

import type { MixQueueItem } from '#lib/collections/mixes/mixes-queue.ts';

interface PlayerBarConfig {
	labels: PlayerLabels;
	libraryUrl: string;
	seekSeconds: number;
	stylesheetUrl: string;
}

const configChecks = {
	labels: (value) => typeof value === 'object' && value !== null,
	libraryUrl: (value) => typeof value === 'string',
	seekSeconds: (value) => typeof value === 'number',
	stylesheetUrl: (value) => typeof value === 'string',
} satisfies Record<keyof PlayerBarConfig, (value: unknown) => boolean>;

const libraryTimeoutMs = 10_000;

type Library = Map<string, MixQueueItem>;

export function configurePlayer(_host: Element, data: unknown): AstroPlayerConfig {
	if (!isPlayerBarConfig(data))
		throw new Error('The player host carries no script of labels and options');

	const { labels, libraryUrl, seekSeconds, stylesheetUrl } = data;
	const loadLibrary = createLibraryLoader(libraryUrl);
	let prefetched: Promise<Library | undefined> | undefined;

	return {
		load: async () => {
			prefetched = prefetchLibrary(loadLibrary);

			const [{ bindPlayerStats }, { trackControlPress, trackPlayerEvent }] = await Promise.all([
				import('#components/player/player-stats.ts'),
				import('#components/player/player-analytics.ts'),
			]);

			return {
				onEvent: trackPlayerEvent,
				onPress: trackControlPress,
				onReady: ({ store }) => {
					void bindPlayerStats(store);
				},
			};
		},
		player: { isScopeEnabled: true, labels },
		seekSeconds,
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

// The stream rides the press row as `sources`, so a press never waits on the Library
function libraryUrls(loadLibrary: () => Promise<Library>): PlayerUrls {
	return {
		detail: async ({ trackId }) => {
			const library = await loadLibrary();

			return library.get(trackId)?.detail;
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

function isPlayerBarConfig(data: unknown): data is PlayerBarConfig {
	if (typeof data !== 'object' || data === null) return false;

	return Object.entries(configChecks).every(([key, check]) => check(Reflect.get(data, key)));
}
