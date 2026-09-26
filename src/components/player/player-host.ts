import type { PlayerLabels, PlayerUrls, QueueItem } from '@xsynaptic/player';

import { bindAstroRouter, loadPersistedStylesheet } from '@xsynaptic/player/astro';
import { holdPresses, isPlayerActionable } from '@xsynaptic/player/boot';

interface PlayerBarConfig {
	isScopeEnabled: boolean;
	labels: PlayerLabels;
	seekSeconds: number;
	stylesheetUrl: string;
}

// The MP4 sample entry code, capital included; Safari answers the lowercase spelling with an empty string
const streamType = 'audio/mp4; codecs="Opus"';

// Both URLs come from the payload, so neither resolver touches the network
const urls: PlayerUrls = {
	archive: (item) => Promise.resolve(payloadUrl(item, 'archiveUrl')),
	stream: (item) => {
		const streamUrl = payloadUrl(item, 'streamUrl');
		if (streamUrl === undefined) {
			return Promise.reject(new Error(`No stream URL for ${item.itemId}`));
		}

		return Promise.resolve({ status: 'ok', type: streamType, url: streamUrl });
	},
};

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

	await Promise.all([
		Promise.race([whenIdle(), presses.pressed]),
		loadPersistedStylesheet(config.stylesheetUrl),
	]);

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

	host.append(
		createPlayer({
			isScopeEnabled: config.isScopeEnabled,
			labels: config.labels,
			seekSeconds: config.seekSeconds,
			store,
			urls,
		}),
	);

	const controls = bindPageControls(store, document, { onPress: trackControlPress });

	presses.release();
	bindAstroRouter(store, controls);
	// Once per document, since Safari reconnects the persisted root on every navigation and a root's binding would clear the lock screen each time
	bindMediaSession(store);
	bindPlayerStats(store, () => loadedItem(store.getState())?.itemId);
	bindPlayerAnalytics(store);
}

// Every item this host queues is a payload item, and the store keeps its fields through a reload
function payloadUrl(item: QueueItem, field: 'archiveUrl' | 'streamUrl'): string | undefined {
	const value: unknown = Reflect.get(item, field);

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
