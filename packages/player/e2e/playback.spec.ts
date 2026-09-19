import { seekSeconds } from '#e2e/constants.ts';
import { expect, expectAdvancing, pressBarControl, test } from '#e2e/test.ts';
import { labels } from '#test/labels.ts';

test('a press on a page control plays', async ({ harness, page }) => {
	const streamResponses: Array<{ headers: Record<string, string>; status: number }> = [];

	page.on('response', (response) => {
		if (!response.url().includes('/audio/long.mp4')) return;

		streamResponses.push({ headers: response.headers(), status: response.status() });
	});

	await harness.open();
	await page.getByRole('button', { name: 'Play long' }).click();

	await expectAdvancing(harness, 1);
	await expect(page.getByRole('button', { exact: true, name: labels.pause })).toBeVisible();
	expect(await harness.read()).toMatchObject({ status: 'playing' });
	expect(await harness.observed()).toMatchObject({ audioCount: 1 });
	expect(streamResponses).toContainEqual({
		headers: expect.objectContaining({
			'access-control-allow-origin': '*',
			'content-range': expect.stringMatching(/^bytes \d+-\d+\/\d+$/),
		}) as unknown,
		status: 206,
	});
});

test('pause and resume keep the loaded source', async ({ harness, page }) => {
	await harness.open();
	await page.getByRole('button', { name: 'Play long' }).click();
	await expectAdvancing(harness, 1);

	const { element } = await harness.read();
	const { loadstarts } = await harness.observed();

	await page.getByRole('button', { exact: true, name: labels.pause }).click();
	await expect.poll(() => harness.read()).toMatchObject({ element: { paused: true } });

	await page.getByRole('button', { exact: true, name: labels.play }).click();
	await expect.poll(() => harness.read()).toMatchObject({ element: { paused: false } });
	await expectAdvancing(harness, (element?.currentTime ?? 0) + 1);

	expect(await harness.read()).toMatchObject({ element: { currentSrc: element?.currentSrc } });
	expect(await harness.observed()).toMatchObject({ loadstarts });
});

test('seek forward moves by the seek step and keeps playing', async ({ harness, page }) => {
	await harness.open();
	await page.getByRole('button', { name: 'Play long' }).click();
	await expectAdvancing(harness, 1);

	const before = await harness.read();
	const beforeSeconds = before.element?.currentTime ?? 0;

	await pressBarControl(page, 'seekForward');
	await expectAdvancing(harness, beforeSeconds + seekSeconds - 1);

	const landed = await harness.read();
	const landedSeconds = landed.element?.currentTime ?? 0;

	expect(landedSeconds).toBeLessThan(beforeSeconds + seekSeconds + 3);
	expect(landed.element?.duration).toBeCloseTo(60, 0);
	await expectAdvancing(harness, landedSeconds + 1);
});

test('next moves to the second row and plays it', async ({ harness, page }) => {
	await harness.open();
	await page.getByRole('button', { name: 'Play long' }).click();
	await expectAdvancing(harness, 1);

	// A press on an empty queue loads the whole payload, so the second row is already queued
	await expect(page.getByRole('button', { name: 'Queue short' })).toBeDisabled();
	await pressBarControl(page, 'next');

	await expect
		.poll(() => harness.read())
		.toMatchObject({ element: { currentSrc: expect.stringContaining('/short.mp4') } });
	await expectAdvancing(harness, 1);
});

test('the end of a track advances the queue without a press', async ({ harness, page }) => {
	await harness.open({ rows: 'short,long' });
	await page.getByRole('button', { name: 'Play short' }).click();

	await expect
		.poll(() => harness.read(), { timeout: 15_000 })
		.toMatchObject({ element: { currentSrc: expect.stringContaining('/long.mp4') } });
	await expectAdvancing(harness, 1);
	expect(await harness.read()).toMatchObject({ status: 'playing' });
});

test('the end of the play order is idle, and the next press reloads', async ({ harness, page }) => {
	await harness.open({ rows: 'short' });
	await page.getByRole('button', { name: 'Play short' }).click();

	await expect.poll(() => harness.read(), { timeout: 15_000 }).toMatchObject({ status: 'idle' });

	await page.getByRole('button', { exact: true, name: labels.play }).click();

	await expect
		.poll(() => harness.read())
		.toMatchObject({ element: { currentSrc: expect.stringContaining('/short.mp4') } });
	await expectAdvancing(harness, 1);
});

test('clearing the queue while playing leaves it idle, not paused', async ({ harness, page }) => {
	await harness.open();
	await page.getByRole('button', { name: 'Play long' }).click();
	await expectAdvancing(harness, 1);

	await pressBarControl(page, 'clearQueue');
	await expect.poll(() => harness.read()).toMatchObject({ status: 'idle' });

	// The pause a reset causes lands late; it must not overwrite `idle`
	await page.waitForTimeout(1000);

	// `currentSrc` keeps the old URL after a reset in every engine; the attribute and the network state are what clear
	expect(await harness.read()).toMatchObject({
		element: { hasSource: false, networkState: 0 },
		isPaused: true,
		status: 'idle',
	});
});

test('switching rows mid-play ends playing, not stranded on a stale pause', async ({
	harness,
	page,
}) => {
	await harness.open();
	await page.getByRole('button', { name: 'Play long' }).click();
	await expectAdvancing(harness, 1);

	await page.getByRole('button', { name: 'Play short' }).click();

	await expect
		.poll(() => harness.read())
		.toMatchObject({ element: { currentSrc: expect.stringContaining('/short.mp4') } });
	await expectAdvancing(harness, 1);
	expect(await harness.read()).toMatchObject({ isPaused: false, status: 'playing' });
});
