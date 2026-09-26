// @vitest-environment happy-dom
import { heldPressAttribute } from '@xsynaptic/player/constants';
import { afterEach, describe, expect, test, vi } from 'vitest';

import { getPlayerLabels } from '#components/player/player-labels.ts';

const store = vi.hoisted(() => ({}));

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

function mountPage({ hasPayload }: { hasPayload: boolean }): void {
	const config = JSON.stringify({
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
