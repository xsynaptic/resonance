// @vitest-environment happy-dom
import { heldPressAttribute } from '@xsynaptic/player/page-control-selectors';
import { afterEach, describe, expect, test, vi } from 'vitest';

import { getPlayerLabels } from '#components/player/player-labels.ts';

const elements = vi.hoisted(() => ({
	bindMediaSession: vi.fn(),
	bindPageControls: vi.fn(),
	definePlayerElements: vi.fn(),
	loadedItem: vi.fn(),
	playerStore: {},
}));

vi.mock('@xsynaptic/player', () => elements);

import { startPlayer } from '#components/player/player-host.ts';

function control(selector: string): HTMLElement {
	const found = document.querySelector<HTMLElement>(selector);
	if (!found) throw new Error(`No control matches ${selector}`);

	return found;
}

function mountPage({ hasPayload }: { hasPayload: boolean }): void {
	const config = JSON.stringify({
		isOverlayEnabled: false,
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

		let rootAtDefine: Element | null | undefined;

		elements.definePlayerElements.mockImplementation(() => {
			rootAtDefine = document.querySelector('player-root');
		});
		startPlayer();
		await settle();

		expect(elements.definePlayerElements).not.toHaveBeenCalled();

		control('[data-play-track] span').click();

		await vi.waitFor(() => {
			expect(elements.bindPageControls).toHaveBeenCalledWith(elements.playerStore, document);
		});
		const root = control(
			'[data-player-host] > player-root[is-primary]',
		) as HTMLElementTagNameMap['player-root'];

		expect(rootAtDefine).toBeNull();
		expect(elements.bindMediaSession).toHaveBeenCalledWith(elements.playerStore, 30);
		expect(root.store).toBe(elements.playerStore);
		expect(root.querySelector(':scope > player-bar')).not.toBeNull();
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

		expect(elements.definePlayerElements).not.toHaveBeenCalled();

		document.body.insertAdjacentHTML('afterbegin', '<div data-player-payload="[]"></div>');
		startPlayer();
		startPlayer();

		await vi.waitFor(() => {
			expect(elements.definePlayerElements).toHaveBeenCalledOnce();
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
