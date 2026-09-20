import { routes } from '#e2e/constants.ts';
import { expect, test, visit } from '#e2e/test.ts';
import { t } from '#lib/i18n/i18n-strings.ts';
import { formatStringTemplate } from '#lib/utils/text.ts';

function getPageOptionLabel(pageNumber: number): string {
	return formatStringTemplate(t('pagination.pageNumber'), { page: pageNumber });
}

test('a List Page loads and its Next link reaches page two', async ({ page }) => {
	const response = await visit(page, routes.mixesIndex);

	expect(response?.status()).toBe(200);
	await expect(page.locator('main a').first()).toBeVisible();

	const nextLink = page.getByRole('link', { name: t('pagination.next') });

	await expect(nextLink).toHaveAttribute('href', routes.mixesIndexPage2);

	await nextLink.click();
	await expect(page).toHaveURL(routes.mixesIndexPage2);
});

test('a change without pointer intent waits for Go', async ({ page }) => {
	await visit(page, routes.mixesIndexPage2);

	const select = page.getByRole('combobox', { name: t('pagination.selectLabel') });

	await expect(select).toBeVisible();
	await select.selectOption({ label: getPageOptionLabel(1) });
	await expect(page).toHaveURL(routes.mixesIndexPage2);

	await page.getByRole('button', { name: t('pagination.submit') }).click();
	await expect(page).toHaveURL(routes.mixesIndex);
});

test('a pointer-driven change navigates at once', async ({ page }) => {
	await visit(page, routes.mixesIndex);

	const select = page.getByRole('combobox', { name: t('pagination.selectLabel') });

	// Stands in for opening the picker, which Playwright cannot drive on a native select
	await expect(select).toBeVisible();
	await select.dispatchEvent('pointerdown');
	await select.selectOption({ label: getPageOptionLabel(2) });

	await expect(page).toHaveURL(routes.mixesIndexPage2);
});

test.describe('on a coarse pointer', () => {
	// A device descriptor cannot go in a describe; these are what make the pointer coarse
	test.use({ hasTouch: true, isMobile: true, viewport: { height: 851, width: 393 } });

	test('a pointer-driven change still waits for Go', async ({ page }) => {
		await visit(page, routes.mixesIndex);

		const select = page.getByRole('combobox', { name: t('pagination.selectLabel') });

		await expect(select).toBeVisible();
		await select.dispatchEvent('pointerdown');
		await select.selectOption({ label: getPageOptionLabel(2) });
		await expect(page).toHaveURL(routes.mixesIndex);

		await page.getByRole('button', { name: t('pagination.submit') }).click();
		await expect(page).toHaveURL(routes.mixesIndexPage2);
	});
});

test('a pointer-driven year pick on the Archive index navigates to that year', async ({ page }) => {
	await visit(page, routes.archiveIndex);

	const select = page.getByRole('combobox', { name: t('archive.selectLabel') });

	await expect(select).toBeVisible();

	const year = await select
		.locator('option:not([disabled]):not([data-current])')
		.first()
		.getAttribute('value');

	if (!year) throw new Error('The Archive index offers no year to pick');

	await select.dispatchEvent('pointerdown');
	await select.selectOption({ value: year });

	await expect(page).toHaveURL(year);
});
