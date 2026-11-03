import type { Page } from '@playwright/test';

import { expect, test, visit } from '#e2e/test.ts';
import { t } from '#lib/i18n/i18n-strings.ts';

test('Pagefind returns a known Entry first', { tag: '@smoke' }, async ({ page, site }) => {
	await visit(page, '/');

	await page.getByRole('button', { name: t('search.toggle.label') }).click();

	const searchInput = page.locator('pagefind-input input');

	await expect(searchInput).toBeVisible();
	await searchInput.pressSequentially(site.postTitle, { delay: 30 });

	const resultLink = page.locator('.pf-result-link').first();

	await expect(resultLink).toBeVisible({ timeout: 10_000 });
	await expect(resultLink).toHaveText(site.postTitle);
});

test('a click opens search from a cold start', async ({ page }) => {
	await visit(page, '/');

	expect(await page.evaluate(() => customElements.get('pagefind-modal') === undefined)).toBe(true);

	const toggle = page.getByRole('button', { name: t('search.toggle.label') });

	await toggle.click();

	await expect(page.locator('pagefind-input input')).toBeFocused();
	await expect(toggle).toHaveAttribute('aria-expanded', 'true');
});

test('the shortcut opens search from a cold start without dropping the keypress', async ({
	page,
}) => {
	await visit(page, '/');

	expect(await page.evaluate(() => customElements.get('pagefind-modal') === undefined)).toBe(true);

	const isMac = await page.evaluate(() => /mac/i.test(navigator.userAgent));

	await page.keyboard.press(isMac ? 'Meta+k' : 'Control+k');

	await expect(page.locator('pagefind-input input')).toBeFocused();
	await expect(page.getByRole('button', { name: t('search.toggle.label') })).toHaveAttribute(
		'aria-expanded',
		'true',
	);
});

interface TrackedEvent {
	data: unknown;
	name: string;
}

async function recordTracking(page: Page): Promise<void> {
	await page.addInitScript(() => {
		const tracked: Array<TrackedEvent> = [];

		Object.assign(window, {
			tracked,
			umami: {
				track: (name: string, data: unknown) => {
					tracked.push({ data, name });
				},
			},
		});
	});
}

function getTracked(page: Page, name: string): Promise<Array<TrackedEvent>> {
	return page.evaluate(
		(eventName) =>
			((window as { tracked?: Array<TrackedEvent> }).tracked ?? []).filter(
				(event) => event.name === eventName,
			),
		name,
	);
}

async function searchFor(page: Page, query: string): Promise<void> {
	const searchInput = page.locator('pagefind-input input');
	const summary = page.locator('pagefind-summary');

	await page.getByRole('button', { name: t('search.toggle.label') }).click();
	await expect(searchInput).toBeFocused();
	await searchInput.pressSequentially(query, { delay: 30 });
	await expect(summary).toContainText(query, { timeout: 10_000 });
	await expect(summary).not.toContainText('Searching');
}

test('search analytics send one event when search closes', async ({ page, site }) => {
	await recordTracking(page);
	await visit(page, '/');
	await searchFor(page, site.postTitle);
	await page.keyboard.press('Escape');

	await expect
		.poll(() => getTracked(page, 'search-query'))
		.toEqual([
			{
				data: { clicked: false, query: site.postTitle, results: expect.any(Number) },
				name: 'search-query',
			},
		]);
	expect(await getTracked(page, 'search-empty')).toEqual([]);
});

test('search analytics mark a result click', async ({ page, site }) => {
	await recordTracking(page);
	await visit(page, '/');
	await searchFor(page, site.postTitle);

	// Navigating away would discard the tracked events before they are read
	await page.evaluate(() => {
		window.addEventListener(
			'click',
			(event) => {
				event.preventDefault();
			},
			{ capture: true },
		);
	});
	await page.locator('.pf-result-link').first().click();

	await expect
		.poll(() => getTracked(page, 'search-query'))
		.toEqual([
			{
				data: { clicked: true, query: site.postTitle, results: expect.any(Number) },
				name: 'search-query',
			},
		]);
});

test('search analytics flag a search with no results', async ({ page }) => {
	const query = 'qqqqqqqq';

	await recordTracking(page);
	await visit(page, '/');
	await searchFor(page, query);
	await page.keyboard.press('Escape');

	await expect
		.poll(() => getTracked(page, 'search-empty'))
		.toEqual([{ data: { query }, name: 'search-empty' }]);
	expect(await getTracked(page, 'search-query')).toEqual([
		{ data: { clicked: false, query, results: 0 }, name: 'search-query' },
	]);
});
