// @vitest-environment happy-dom
import { afterEach, describe, expect, test, vi } from 'vitest';

import playerDirective from '#components/player/player-directive.ts';
import { heldPressAttribute, listeningEvent } from '#components/player/player-held-press.ts';

function control(selector: string): HTMLElement {
	const found = document.querySelector<HTMLElement>(selector);
	if (!found) throw new Error(`No control matches ${selector}`);

	return found;
}

// Idle never arrives, so only a press can start hydration
function mountIsland() {
	vi.stubGlobal('requestIdleCallback', () => 0);
	document.body.innerHTML = `
		<div data-player-payload="[]"></div>
		<button data-play-track="a"><span>Play</span></button>
		<button data-queue-track="a">Queue</button>
	`;

	const island = document.createElement('astro-island');
	const hydrate = vi.fn(() => Promise.resolve());

	document.body.append(island);
	playerDirective(
		() => Promise.resolve(hydrate),
		{ name: 'PlayerIsland', value: 'data:text/css,' },
		island,
	);

	return hydrate;
}

afterEach(() => {
	document.dispatchEvent(new Event(listeningEvent));
	document.body.replaceChildren();
	vi.unstubAllGlobals();
});

describe('player directive', () => {
	test('a press before idle hydrates at once and is held for the island to replay', async () => {
		const hydrate = mountIsland();

		await new Promise((resolve) => setTimeout(resolve, 50));

		expect(hydrate).not.toHaveBeenCalled();

		control('[data-play-track] span').click();

		await vi.waitFor(() => {
			expect(hydrate).toHaveBeenCalledOnce();
		});
		expect(control('[data-play-track]').hasAttribute(heldPressAttribute)).toBe(true);
	});

	// The router moves a persisted island into each incoming page, and every move runs the directive again
	test('a later run for the same island hydrates once a payload arrives, and only once', async () => {
		vi.stubGlobal('requestIdleCallback', (callback: () => void) => {
			callback();

			return 0;
		});

		const island = document.createElement('astro-island');
		const hydrate = vi.fn(() => Promise.resolve());
		const run = () => {
			playerDirective(
				() => Promise.resolve(hydrate),
				{ name: 'PlayerIsland', value: 'data:text/css,' },
				island,
			);
		};

		document.body.append(island);
		run();

		await new Promise((resolve) => setTimeout(resolve, 50));

		expect(hydrate).not.toHaveBeenCalled();

		document.body.insertAdjacentHTML('afterbegin', '<div data-player-payload="[]"></div>');
		run();
		run();

		await vi.waitFor(() => {
			expect(hydrate).toHaveBeenCalledOnce();
		});
	});

	test('a press once the island listens is left to the island', async () => {
		const hydrate = mountIsland();

		control('[data-play-track]').click();

		await vi.waitFor(() => {
			expect(hydrate).toHaveBeenCalledOnce();
		});

		document.dispatchEvent(new Event(listeningEvent));
		control('[data-queue-track]').click();

		expect(control('[data-queue-track]').hasAttribute(heldPressAttribute)).toBe(false);
	});
});
