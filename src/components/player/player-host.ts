import type { createPlayerStore, PlayerLabels, PlayerUrls, QueueItem } from '@xsynaptic/player';

import {
	controlSelector,
	heldPressAttribute,
	heldPressSelector,
	payloadSelector,
} from '@xsynaptic/player/page-control-selectors';
import { queueStorageKey } from '@xsynaptic/player/queue-storage-key';

interface PlayerBarConfig {
	isOverlayEnabled: boolean;
	isScopeEnabled: boolean;
	labels: PlayerLabels;
	seekSeconds: number;
	stylesheetUrl: string;
}

const streamType = 'audio/mp4; codecs="opus"';

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
	if (!host || started.has(host) || !isActionable()) return;

	started.add(host);
	void loadPlayer(host);
}

function createRoot(
	config: PlayerBarConfig,
	store: ReturnType<typeof createPlayerStore>,
): HTMLElementTagNameMap['player-root'] {
	const root = document.createElement('player-root');

	root.className = 'player block';
	root.toggleAttribute('is-primary', true);
	root.isOverlayEnabled = config.isOverlayEnabled;
	root.isScopeEnabled = config.isScopeEnabled;
	root.labels = config.labels;
	root.seekSeconds = config.seekSeconds;
	root.store = store;
	root.urls = urls;
	root.append(document.createElement('player-bar'));

	return root;
}

// A page that can queue something, or a listener whose bar is already showing
function isActionable(): boolean {
	if (document.querySelector(payloadSelector)) return true;

	try {
		return localStorage.getItem(queueStorageKey) !== null;
	} catch {
		return false;
	}
}

// Defined before the root is built, so its options arrive through the setters
async function loadPlayer(host: Element): Promise<void> {
	const config = readConfig(host);
	const holding = new AbortController();

	await Promise.all([
		Promise.race([whenIdle(), whenPressed(holding.signal)]),
		loadStylesheet(config.stylesheetUrl),
	]);

	const [
		{ bindMediaSession, bindPageControls, definePlayerElements, loadedItem, playerStore },
		{ bindPlayerStats },
		{ bindPlayerAnalytics, trackControlPress },
	] = await Promise.all([
		import('@xsynaptic/player'),
		import('#components/player/player-stats.ts'),
		import('#components/player/player-analytics.ts'),
	]);

	definePlayerElements();
	host.append(createRoot(config, playerStore));
	holding.abort();
	bindPageControls(playerStore, document, { onPress: trackControlPress });
	// Once per document, since Safari reconnects the persisted root on every navigation and a root's binding would clear the lock screen each time
	bindMediaSession(playerStore, config.seekSeconds);
	bindPlayerStats(playerStore, () => loadedItem(playerStore.getState())?.itemId);
	bindPlayerAnalytics(playerStore);
}

// A link moved with the persisted bar drops out of `document.styleSheets`, so the sheet lives in the head
function loadStylesheet(href: string): Promise<void> {
	const link = document.createElement('link');

	link.href = href;
	link.rel = 'stylesheet';

	// The router keeps a head stylesheet only when the incoming head carries the same href
	document.addEventListener('astro:before-swap', ({ newDocument }) => {
		newDocument.head.append(link.cloneNode());
	});

	// A failed sheet still loads the player, since an unstyled bar still plays
	return new Promise((resolve) => {
		link.addEventListener('error', () => {
			resolve();
		});
		link.addEventListener('load', () => {
			resolve();
		});
		document.head.append(link);
	});
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

// A press skips the idle wait, and its control stays marked until the page controls replay it; the latest press wins
function whenPressed(signal: AbortSignal): Promise<void> {
	return new Promise((resolve) => {
		const onPress = (event: MouseEvent): void => {
			if (!(event.target instanceof Element)) return;

			const pressed = event.target.closest(controlSelector);
			if (!pressed) return;

			for (const held of document.querySelectorAll(heldPressSelector)) {
				held.removeAttribute(heldPressAttribute);
			}

			pressed.toggleAttribute(heldPressAttribute, true);
			resolve();
		};

		document.addEventListener('click', onPress, { capture: true, signal });
	});
}
