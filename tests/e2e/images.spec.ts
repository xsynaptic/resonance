import type { Locator, Page } from '@playwright/test';

import { expect, test, visit } from '#e2e/test.ts';

const desktopWidthMaximum = 700;
const mobileWidthMaximum = 500;

function getFeaturedImage(page: Page): Locator {
	return page.locator('.featured-grid-image img');
}

// Astro's sharp service hashes the width out of the filename, so the `w` descriptor is the only reading
async function getSelectedWidth(image: Locator): Promise<number> {
	await expect
		.poll(() => image.evaluate((element: HTMLImageElement) => element.currentSrc))
		.not.toBe('');

	const width = await image.evaluate((element: HTMLImageElement) => {
		const selected = element.srcset
			.split(',')
			.map((candidate) => candidate.trim().split(/\s+/))
			.find(([source]) => source === new URL(element.currentSrc).pathname);

		return Number(selected?.[1]?.replace('w', ''));
	});

	if (!Number.isFinite(width)) throw new Error('No srcset candidate matches currentSrc');

	return width;
}

test.describe('on a desktop viewport', () => {
	test.use({ viewport: { height: 720, width: 1280 } });

	test('the Featured Image selects an optimized width', async ({ page, site }) => {
		await visit(page, site.mixDetail);

		expect(await getSelectedWidth(getFeaturedImage(page))).toBeLessThanOrEqual(desktopWidthMaximum);
	});
});

test.describe('on a phone viewport', () => {
	test.use({ viewport: { height: 844, width: 390 } });

	test('the Featured Image selects a smaller width', async ({ page, site }) => {
		await visit(page, site.mixDetail);

		expect(await getSelectedWidth(getFeaturedImage(page))).toBeLessThanOrEqual(mobileWidthMaximum);
	});
});
