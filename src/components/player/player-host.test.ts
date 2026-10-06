// @vitest-environment happy-dom
import type { PlayerUrls } from '@xsynaptic/player';

import { heldPressAttribute } from '@xsynaptic/player/constants';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { getPlayerLabels } from '#components/player/player-labels.ts';

const refreshQueue = vi.hoisted(() => vi.fn());
const store = vi.hoisted(() => ({ getState: () => ({ refreshQueue }) }));

const elements = vi.hoisted(() => ({
	bindMediaSession: vi.fn(),
	bindPageControls: vi.fn(() => ({ refresh: vi.fn(), unbind: vi.fn() })),
	createPlayer: vi.fn(() => document.createElement('player-root')),
	createPlayerStore: vi.fn(() => store),
	loadedItem: vi.fn(),
}));

// Bound for real under `NODE_ENV=production`, where `import.meta.env.DEV` stops short-circuiting it
const stats = vi.hoisted(() => ({ bindPlayerStats: vi.fn() }));
const analytics = vi.hoisted(() => ({ bindPlayerAnalytics: vi.fn(), trackControlPress: vi.fn() }));

vi.mock('@xsynaptic/player', () => elements);
vi.mock('#components/player/player-analytics.ts', () => analytics);
vi.mock('#components/player/player-stats.ts', () => stats);

import { startPlayer } from '#components/player/player-host.ts';

function control(selector: string): HTMLElement {
	const found = document.querySelector<HTMLElement>(selector);
	if (!found) throw new Error(`No control matches ${selector}`);

	return found;
}

const catalogueEntry = {
	detail: { trackCount: 3 },
	press: {
		artistLine: 'Basilisk',
		itemId: 'a',
		releaseTitle: 'A',
		streamUrl: '/a.mp4',
		title: 'A',
	},
};

function mountPage({ hasPayload }: { hasPayload: boolean }): void {
	const config = JSON.stringify({
		catalogueUrl: '/api/player/catalogue.json?v=abc',
		isScopeEnabled: false,
		labels: getPlayerLabels(),
		seekSeconds: 30,
		stylesheetUrl: 'data:text/css,',
	});

	document.body.innerHTML = `
		${hasPayload ? '<div data-player-payload="[]"></div>' : ''}
		<button data-play-track="a"><span>Play</span></button>
		<button data-queue-track="a">Queue</button>
		<div data-player-host><script type="application/json">${config}</script></div>
	`;
}

function settle(): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, 50));
}

beforeEach(() => {
	vi.stubGlobal(
		'fetch',
		vi.fn(() => Promise.reject(new TypeError('Failed to fetch'))),
	);
});

afterEach(() => {
	document.body.replaceChildren();
	vi.clearAllMocks();
	vi.unstubAllGlobals();
});

describe('startPlayer', () => {
	test('a press before idle loads the player at once and is held for the page controls', async () => {
		vi.stubGlobal('requestIdleCallback', () => 0);
		mountPage({ hasPayload: true });
		startPlayer();
		await settle();

		expect(elements.createPlayer).not.toHaveBeenCalled();

		control('[data-play-track] span').click();

		await vi.waitFor(() => {
			expect(elements.bindPageControls).toHaveBeenCalledWith(store, document, {
				onPress: analytics.trackControlPress,
			});
		});

		expect(elements.createPlayer).toHaveBeenCalledWith(
			expect.objectContaining({ isScopeEnabled: false, seekSeconds: 30, store }),
		);
		expect(document.querySelector('[data-player-host] > player-root')).not.toBeNull();
		expect(elements.bindMediaSession).toHaveBeenCalledWith(store);
		expect(stats.bindPlayerStats).toHaveBeenCalledWith(store, expect.any(Function));
		expect(analytics.bindPlayerAnalytics).toHaveBeenCalledWith(store);
		expect(control('[data-play-track]').hasAttribute(heldPressAttribute)).toBe(true);
	});

	test('a later page load that brings a payload starts the player, and only once', async () => {
		vi.stubGlobal('requestIdleCallback', (callback: () => void) => {
			callback();

			return 0;
		});
		mountPage({ hasPayload: false });
		startPlayer();
		await settle();

		expect(elements.createPlayer).not.toHaveBeenCalled();

		document.body.insertAdjacentHTML('afterbegin', '<div data-player-payload="[]"></div>');
		startPlayer();
		startPlayer();

		await vi.waitFor(() => {
			expect(elements.createPlayer).toHaveBeenCalledOnce();
		});
		expect(elements.bindMediaSession).toHaveBeenCalledOnce();
	});

	test('the catalogue refreshes the stored Queue with its press rows, and answers for detail', async () => {
		const fetchCatalogue = vi.fn(() => Promise.resolve(Response.json([catalogueEntry])));

		vi.stubGlobal('fetch', fetchCatalogue);
		vi.stubGlobal('requestIdleCallback', (callback: () => void) => {
			callback();

			return 0;
		});
		mountPage({ hasPayload: true });
		startPlayer();

		await vi.waitFor(() => {
			expect(refreshQueue).toHaveBeenCalledWith([catalogueEntry.press]);
		});
		expect(fetchCatalogue).toHaveBeenCalledExactlyOnceWith('/api/player/catalogue.json?v=abc');

		const [{ urls }] = elements.createPlayer.mock.lastCall as unknown as [{ urls: PlayerUrls }];

		await expect(urls.detail?.(catalogueEntry.press)).resolves.toStrictEqual(catalogueEntry.detail);
	});

	test('a catalogue that fails leaves the Queue alone and answers no detail', async () => {
		vi.stubGlobal('requestIdleCallback', (callback: () => void) => {
			callback();

			return 0;
		});
		mountPage({ hasPayload: true });
		startPlayer();

		await vi.waitFor(() => {
			expect(elements.createPlayer).toHaveBeenCalledOnce();
		});

		const [{ urls }] = elements.createPlayer.mock.lastCall as unknown as [{ urls: PlayerUrls }];

		await expect(urls.detail?.(catalogueEntry.press)).resolves.toBeUndefined();
		expect(refreshQueue).not.toHaveBeenCalled();
	});

	test('a press once the page controls are bound is left to them', async () => {
		vi.stubGlobal('requestIdleCallback', () => 0);
		mountPage({ hasPayload: true });
		startPlayer();
		control('[data-play-track]').click();

		await vi.waitFor(() => {
			expect(elements.bindPageControls).toHaveBeenCalledOnce();
		});

		control('[data-queue-track]').click();

		expect(control('[data-queue-track]').hasAttribute(heldPressAttribute)).toBe(false);
	});
});
