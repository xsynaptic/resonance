import type { Page } from '@playwright/test';

import { expect, test, visit } from '#e2e/test.ts';
import { t } from '#lib/i18n/i18n-strings.ts';

const bodyLengthMinimum = 50;

async function expectEntryRenders(page: Page, hasDate = true): Promise<void> {
	const heading = page.getByRole('heading', { level: 1 });

	await expect(heading).toBeVisible();
	await expect(heading).not.toBeEmpty();

	if (hasDate) await expect(page.locator('article time').first()).toBeVisible();

	const body = page.locator('article p').first();

	await expect(body).toBeVisible();

	const bodyText = await body.innerText();

	expect(bodyText.trim().length).toBeGreaterThan(bodyLengthMinimum);
}

test('a Post renders', { tag: '@smoke' }, async ({ page, site }) => {
	await visit(page, site.postDetail);
	await expectEntryRenders(page);
});

test('a Page renders', async ({ page }) => {
	await visit(page, '/');
	await page
		.getByRole('navigation', { name: t('nav.primary.label') })
		.getByRole('link', { exact: true, name: 'About' })
		.click();

	await expect(page.getByRole('heading', { level: 1 })).toHaveText('About');
	await expectEntryRenders(page, false);
});

test('a Review renders', async ({ page, site }) => {
	await visit(page, site.reviewDetail);
	await expectEntryRenders(page);
});

test('a Mix renders', { tag: '@smoke' }, async ({ page, site }) => {
	await visit(page, site.mixDetail);
	await expectEntryRenders(page);
});
