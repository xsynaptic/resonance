import type { Page } from '@playwright/test';

import { expect, test } from '#e2e/test.ts';
import { labels } from '#test/labels.ts';

test.skip(({ isMobile }) => !isMobile, 'The strip exists only in the mini layout');

function strip(page: Page) {
	return page
		.getByRole('region', { name: labels.nowPlaying })
		.getByRole('slider', { name: labels.seek });
}

test('a tap on the strip seeks to its share of the track', async ({ harness, page }) => {
	await harness.open();
	await page.getByRole('button', { name: 'Play long' }).click();
	await expect(strip(page)).toBeVisible();

	const box = await strip(page).boundingBox();
	if (!box) throw new Error('The strip has no box to tap');

	await strip(page).tap({ position: { x: box.width / 4, y: box.height / 2 } });

	const position = async () => {
		const { currentTimeSeconds } = await harness.read();

		return currentTimeSeconds;
	};

	await expect.poll(position).toBeGreaterThan(14);
	expect(await position()).toBeLessThan(20);
});

test('a drag the browser cancels leaves the position where it was', async ({ harness, page }) => {
	await harness.open();
	await page.getByRole('button', { name: 'Play long' }).click();
	await expect(strip(page)).toBeVisible();
	await page.getByRole('button', { exact: true, name: labels.pause }).click();

	const { currentTimeSeconds: before } = await harness.read();
	const box = await strip(page).boundingBox();
	if (!box) throw new Error('The strip has no box to press');

	const touch = {
		bubbles: true,
		buttons: 1,
		clientY: box.y + box.height / 2,
		isPrimary: true,
		pointerId: 1,
		pointerType: 'touch',
	};

	await strip(page).dispatchEvent('pointerdown', { ...touch, clientX: box.x + box.width / 4 });
	await strip(page).dispatchEvent('pointermove', { ...touch, clientX: box.x + box.width * 0.75 });
	await expect(strip(page)).toHaveAttribute('data-scrubbing');

	await strip(page).dispatchEvent('pointercancel', { ...touch, buttons: 0 });
	await expect(strip(page)).not.toHaveAttribute('data-scrubbing');

	const { currentTimeSeconds: after } = await harness.read();

	expect(after).toBeCloseTo(before, 0);
});
