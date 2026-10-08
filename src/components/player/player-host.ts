import type { PlayerLabels, PlayerUrls, QueueItem } from '@xsynaptic/player';

import { bindAstroRouter, loadPersistedStylesheet } from '@xsynaptic/player/astro';
import { holdPresses, isPlayerActionable } from '@xsynaptic/player/boot';

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

// Keyed by the host element, which the router carries into every page it persists the bar through
const started = new WeakSet<Element>();

// Called again on each page load, since a soft navigation can bring the first payload
export function startPlayer(): void {
	const host = document.querySelector('[data-player-host]');
	if (!host || started.has(host) || !isPlayerActionable(document)) return;

	started.add(host);
	void loadPlayer(host);
}

async function loadPlayer(host: Element): Promise<void> {
	const config = readConfig(host);
	const presses = holdPresses(document);

	const wanted = Promise.race([whenIdle(), presses.pressed]);
	const loadLibrary = createLibraryLoader(config.libraryUrl);
	const booted = bootLibrary(wanted, loadLibrary);

	await Promise.all([wanted, loadPersistedStylesheet(config.stylesheetUrl)]);

	const [
		{ bindMediaSession, bindPageControls, createPlayer, createPlayerStore, loadedItem },
		{ bindPlayerStats },
		{ bindPlayerAnalytics, trackControlPress },
	] = await Promise.all([
		import('@xsynaptic/player'),
		import('#components/player/player-stats.ts'),
		import('#components/player/player-analytics.ts'),
	]);

	const store = createPlayerStore();
	let hasRefreshed = false;

	// A stored Queue catches up on any page, its content-hashed stream and artwork URLs included
	function refreshQueue(library: Library): void {
		if (hasRefreshed) return;

		hasRefreshed = true;
		store.getState().refreshQueue([...library.values()].map(({ press }) => press));
	}

	host.append(
		createPlayer({
			isScopeEnabled: true,
			labels: config.labels,
			seekSeconds: config.seekSeconds,
			store,
			urls: libraryUrls(async () => {
				const library = await loadLibrary();

				refreshQueue(library);

				return library;
			}),
		}),
	);

	void booted.then((library) => {
		if (library) refreshQueue(library);
	});

	const controls = bindPageControls(store, document, { onPress: trackControlPress });

	presses.release();
	bindAstroRouter(store, controls);
	// Once per document, since Safari reconnects the persisted root on every navigation and a root's binding would clear the lock screen each time
	bindMediaSession(store);
	bindPlayerStats(store, () => loadedItem(store.getState())?.itemId);
	bindPlayerAnalytics(store);
}

// The stream comes from the press row, so a press never waits on the Library
function libraryUrls(loadLibrary: () => Promise<Library>): PlayerUrls {
	return {
		detail: async ({ itemId }) => {
			const library = await loadLibrary();

			return library.get(itemId)?.detail;
		},
		stream: (item) => {
			const streamUrl = pressRowStreamUrl(item);
			if (streamUrl === undefined) {
				return Promise.reject(new Error(`No stream URL for ${item.itemId}`));
			}

			return Promise.resolve({ status: 'ok', type: streamType, url: streamUrl });
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

async function bootLibrary(
	wanted: Promise<void>,
	loadLibrary: () => Promise<Library>,
): Promise<Library | undefined> {
	await wanted;

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

	return new Map(entries.map((entry) => [entry.press.itemId, entry]));
}

// Every item this host queues is a press row, and the store keeps its fields through a reload
function pressRowStreamUrl(item: QueueItem): string | undefined {
	const value: unknown = Reflect.get(item, 'streamUrl');

	return typeof value === 'string' ? value : undefined;
}

function readConfig(host: Element): PlayerBarConfig {
	const source = host.querySelector('script[type="application/json"]')?.textContent;
	if (!source) throw new Error('The player host carries no script of labels and options');

	return JSON.parse(source) as PlayerBarConfig;
}

function whenIdle(): Promise<void> {
	return new Promise((resolve) => {
		if (typeof requestIdleCallback === 'function') {
			requestIdleCallback(() => {
				resolve();
			});
			return;
		}

		setTimeout(resolve, 200);
	});
}
