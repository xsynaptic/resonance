import { expect, expectAdvancing, test } from '#e2e/test.ts';
import { labels } from '#test/labels.ts';

const webkitProjects = new Set(['mobile-webkit', 'webkit']);

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
