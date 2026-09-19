import { seekSeconds } from '#e2e/constants.ts';
import { expect, expectAdvancing, pressBarControl, test } from '#e2e/test.ts';
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

	const { element, resolveCount } = await harness.read();

	expect(resolveCount).toBe(2);
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

test('the lowercase probe spelling still plays the real file', async ({ harness, page }) => {
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

test('a capped resolve requests no stream', async ({ harness, page }) => {
	await harness.open({ resolve: 'capped' });
	await page.getByRole('button', { name: 'Play long' }).click();

	await expect(page.getByRole('status').filter({ hasText: labels.capped })).toBeVisible();
	expect(await harness.read()).toMatchObject({ status: 'capped' });
	expect(await harness.requests()).toEqual([]);
});

test('a seek while the stream resolves is where playback starts', async ({ harness, page }) => {
	await harness.open({ resolveDelay: 2000 });
	await page.getByRole('button', { name: 'Play long' }).click();
	await pressBarControl(page, 'seekForward');

	expect(await harness.read()).toMatchObject({ element: { currentSrc: '' } });
	await expect.poll(() => harness.read()).toMatchObject({ status: 'playing' });

	const { element } = await harness.read();
	const startedAt = element?.currentTime ?? 0;

	expect(startedAt).toBeGreaterThan(seekSeconds - 1);
	expect(startedAt).toBeLessThan(seekSeconds + 3);
});

test('a resolve that lands after a switch loads nothing', async ({ harness, page }) => {
	await harness.open({ resolveDelay: 2000 });
	await page.getByRole('button', { name: 'Play long' }).click();
	await page.getByRole('button', { name: 'Play short' }).click();

	await expect.poll(() => harness.read()).toMatchObject({ status: 'playing' });
	await expectAdvancing(harness, 1);

	const requests = await harness.requests();
	const paths = requests.map(({ path }) => path);

	expect(paths.length).toBeGreaterThan(0);
	expect(paths.every((path) => path.endsWith('/short.mp4'))).toBe(true);
});

test('pause during a hanging load settles on paused', async ({ harness, page }) => {
	await harness.open({ stream: 'hang' });
	await page.getByRole('button', { name: 'Play long' }).click();
	await expect.poll(() => harness.requests()).not.toEqual([]);

	await page.getByRole('button', { exact: true, name: labels.pause }).click();

	await expect.poll(() => harness.read()).toMatchObject({ status: 'paused' });

	const { isPaused, playbackError } = await harness.read();

	expect(isPaused).toBe(true);
	expect(playbackError).toBeUndefined();
});
