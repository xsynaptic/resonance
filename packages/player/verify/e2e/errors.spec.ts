import type { Page } from '@playwright/test';
import type { StreamResolution } from '@xsynaptic/player';

import { expect, expectAdvancing, test } from '#e2e/test.ts';
import { stallAfterMs } from '#engine/audio-engine.ts';
import { labels } from '#test/labels.ts';

interface HeldStream {
	answer?: (resolution: StreamResolution) => void;
	calls: number;
	reject?: () => void;
}

declare global {
	interface Window {
		heldStream?: HeldStream;
	}
}

const webkitProjects = new Set(['mobile-webkit', 'webkit']);

async function holdStream(page: Page): Promise<void> {
	await page.evaluate(() => {
		const store = window.playerPage?.store;
		const urls = store?.getState().urls;
		if (!store || !urls) throw new Error('The player is not bound');

		const held: HeldStream = { calls: 0 };

		Object.defineProperty(window, 'heldStream', { value: held });
		store.getState().configure({
			urls: {
				...urls,
				stream: () =>
					new Promise<StreamResolution>((resolve, reject) => {
						held.calls += 1;
						held.answer = resolve;
						held.reject = () => {
							reject(new Error('Held stream rejected'));
						};
					}),
			},
		});
	});
}

async function answerWithStream(page: Page): Promise<void> {
	await page.evaluate(() => {
		const state = window.playerPage?.store.getState();
		const item = state?.currentIndex === undefined ? undefined : state.queue[state.currentIndex];
		const url: unknown = item && Reflect.get(item, 'streamUrl');
		if (typeof url !== 'string') throw new TypeError('Nothing loaded');

		window.heldStream?.answer?.({ status: 'ok', url });
	});
}

function readHeldCalls(page: Page): Promise<number | undefined> {
	return page.evaluate(() => window.heldStream?.calls);
}

// Chromium and WebKit log the 404 a missing stream answers with; Firefox does not
const notFoundLog = /the server responded with a status of 404/;

test('a missing stream ends in error after one re-resolve', async ({
	consoleGuard,
	harness,
	page,
}) => {
	consoleGuard.allow(notFoundLog);
	await harness.open({ stream: 'missing' });
	await page.getByRole('button', { name: 'Play long' }).click();

	await expect(page.getByRole('status').filter({ hasText: labels.error })).toBeVisible();
	expect(await harness.read()).toMatchObject({ resolveCount: 2, status: 'error' });

	const { diagnostics } = await harness.read();

	expect(diagnostics).toContainEqual(
		expect.objectContaining({ code: expect.any(Number), isRetry: true, kind: 'media-error' }),
	);
	expect(diagnostics).not.toContainEqual(expect.objectContaining({ kind: 'retry-recovered' }));
});

test('a retry after a failed load resumes from the restored position', async ({
	consoleGuard,
	harness,
	page,
}) => {
	consoleGuard.allow(notFoundLog);
	await harness.open();
	await page.getByRole('button', { name: 'Play long' }).click();
	await expectAdvancing(harness, 1);
	await page.evaluate(() => {
		window.playerPage?.store.getState().seek(20);
	});
	await expectAdvancing(harness, 20);

	await harness.open({ stream: 'flaky' });

	const { currentTimeSeconds: saved } = await harness.read();

	await page.getByRole('button', { exact: true, name: labels.play }).click();
	await expect.poll(() => harness.read()).toMatchObject({ status: 'playing' });

	const { diagnostics, element, resolveCount } = await harness.read();

	expect(resolveCount).toBe(2);
	expect(diagnostics).toContainEqual(
		expect.objectContaining({ isRetry: true, kind: 'retry-recovered', stage: expect.any(String) }),
	);
	expect(Math.abs((element?.currentTime ?? 0) - saved)).toBeLessThan(3);
	expect(await harness.requests()).toContainEqual(expect.objectContaining({ status: 404 }));
});

test('garbage bytes end in error after one re-resolve', async ({ harness, page }, testInfo) => {
	await harness.open({ stream: 'garbage' });
	await page.getByRole('button', { name: 'Play long' }).click();

	await expect.poll(() => harness.read()).toMatchObject({ status: 'error' });
	expect(await harness.read()).toMatchObject({ resolveCount: 2 });

	const mediaError = await page.evaluate(() => {
		const error = window.playerPage?.store.getState().getMediaElement()?.error;

		return error && { code: error.code, message: error.message };
	});

	await testInfo.attach('media-error.json', {
		body: JSON.stringify(mediaError, undefined, '\t'),
		contentType: 'application/json',
	});
});

test('the lowercase probe spelling still plays the real file', async ({
	harness,
	page,
}, testInfo) => {
	test.skip(
		!webkitProjects.has(testInfo.project.name),
		'Only WebKit declines the lowercase spelling',
	);

	await harness.open({ type: 'lowercase' });
	await page.getByRole('button', { name: 'Play long' }).click();

	await expectAdvancing(harness, 1);
	expect(await harness.read()).toMatchObject({ status: 'playing' });
});

test('a declined type that fails to load is unplayable, with no retry', async ({
	harness,
	page,
}, testInfo) => {
	test.skip(
		!webkitProjects.has(testInfo.project.name),
		'Only WebKit declines the lowercase spelling',
	);

	await harness.open({ stream: 'garbage', type: 'lowercase' });
	await page.getByRole('button', { name: 'Play long' }).click();

	await expect(page.getByRole('status').filter({ hasText: labels.unplayable })).toBeVisible();
	expect(await harness.read()).toMatchObject({ resolveCount: 1, status: 'unplayable' });
});

test('pause during a hanging load settles on paused', async ({ harness, page }) => {
	await harness.open({ stream: 'hang' });
	await page.getByRole('button', { name: 'Play long' }).click();
	await expect.poll(() => harness.requests()).not.toEqual([]);

	await page.getByRole('button', { exact: true, name: labels.pause }).click();

	await expect.poll(() => harness.read()).toMatchObject({ status: 'paused' });

	// The store turns `paused` on the press itself; a late `waiting` or `error` from the element lands after
	await page.waitForTimeout(1000);

	const { isPaused, playbackError, status } = await harness.read();

	expect(status).toBe('paused');
	expect(isPaused).toBe(true);
	expect(playbackError).toBeUndefined();
});

// Playwright cannot hide a page, so the return is dispatched; what the element does with the reload is real
test('a load starved past the stall threshold starts again when the page comes back', async ({
	harness,
	page,
}) => {
	await page.clock.install();
	await harness.open({ stream: 'stalled' });
	await page.getByRole('button', { name: 'Play long' }).click();
	await expect.poll(() => harness.requests()).toEqual([expect.objectContaining({ status: 0 })]);

	await page.clock.fastForward(stallAfterMs);
	await expect
		.poll(async () => {
			const { diagnostics } = await harness.read();

			return diagnostics;
		})
		.toContainEqual(expect.objectContaining({ hasPlayed: false, kind: 'stall', readyState: 0 }));

	await page.evaluate(() => {
		Object.defineProperty(document, 'hidden', { configurable: true, value: true });
		document.dispatchEvent(new Event('visibilitychange'));
		Reflect.deleteProperty(document, 'hidden');
		document.dispatchEvent(new Event('visibilitychange'));
	});

	await expectAdvancing(harness, 1);
	expect(await harness.read()).toMatchObject({ resolveCount: 1, status: 'playing' });
	expect(await harness.requests()).toContainEqual(expect.objectContaining({ status: 206 }));
});

test('an outside pause after a capped answer stays capped, and the next play resolves again', async ({
	harness,
	page,
}) => {
	await harness.open();
	await holdStream(page);
	await page.getByRole('button', { name: 'Play long' }).click();
	await page.getByRole('button', { exact: true, name: labels.pause }).click();

	await page.evaluate(async () => {
		const state = window.playerPage?.store.getState();
		const element = state?.getMediaElement();
		if (!state || !element) throw new Error('Nothing loaded');

		const waiting = new Promise((resolve) => {
			element.addEventListener('waiting', resolve, { once: true });
		});

		state.play();
		await waiting;
		window.heldStream?.answer?.({ status: 'capped' });
	});
	await expect
		.poll(() => harness.read())
		.toMatchObject({ element: { hasSource: false, paused: true }, status: 'capped' });

	await page.evaluate(() => {
		window.playerPage?.store.getState().pause();
	});
	await page.waitForTimeout(500);
	expect(await harness.read()).toMatchObject({ isPaused: true, status: 'capped' });

	await page.evaluate(() => {
		window.playerPage?.store.getState().play();
	});
	await expect.poll(() => readHeldCalls(page)).toBe(2);

	await answerWithStream(page);
	await expectAdvancing(harness, 1);
});

test('a resolve failing as a paused load resumes stays in error, and the next play resolves again', async ({
	harness,
	page,
}) => {
	await harness.open();
	await holdStream(page);
	await page.getByRole('button', { name: 'Play long' }).click();
	await page.getByRole('button', { exact: true, name: labels.pause }).click();

	await page.evaluate(() => {
		window.playerPage?.store.getState().play();
		window.heldStream?.reject?.();
	});
	await expect.poll(() => harness.read()).toMatchObject({ isPaused: true, status: 'error' });
	await page.waitForTimeout(500);
	expect(await harness.read()).toMatchObject({ element: { paused: true }, status: 'error' });

	await page.getByRole('button', { exact: true, name: labels.play }).click();
	await expect.poll(() => readHeldCalls(page)).toBe(2);

	await answerWithStream(page);
	await expectAdvancing(harness, 1);
});
