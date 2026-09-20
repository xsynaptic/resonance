import { routes } from '#e2e/constants.ts';
import { expect, test, visit } from '#e2e/test.ts';
import { t } from '#lib/i18n/i18n-strings.ts';

// Literals, because `navigationHeaderItems` names them as literals too
const exploreTitle = 'Explore';
const artistsTitle = 'Artists';
const mixesTitle = 'Mixes';
const postsTitle = 'Posts';

test('a submenu reveals on hover', async ({ page }) => {
	await visit(page, '/');

	const nav = page.getByRole('navigation', { name: t('nav.primary.label') });

	await nav.getByRole('button', { name: exploreTitle }).hover();

	const artistsLink = nav.getByRole('link', { exact: true, name: artistsTitle });

	await expect(artistsLink).toBeVisible();
	await expect(artistsLink).toHaveAttribute('href', '/artists/');
});

test('the current page is the only one marked', async ({ page }) => {
	await visit(page, routes.mixesIndex);

	const nav = page.getByRole('navigation', { name: t('nav.primary.label') });

	await expect(nav.getByRole('link', { exact: true, name: mixesTitle })).toHaveAttribute(
		'aria-current',
		'page',
	);
	await expect(nav.getByRole('link', { exact: true, name: postsTitle })).not.toHaveAttribute(
		'aria-current',
	);
});

test('a header link navigates client-side and the chrome survives the swap', async ({ page }) => {
	await visit(page, routes.mixesIndex);

	// A window property dies with its document, where a `load` count races the URL assertion on a slow host
	await page.evaluate(() => Object.assign(window, { survivesSwap: true }));

	await page
		.getByRole('navigation', { name: t('nav.primary.label') })
		.getByRole('link', { exact: true, name: postsTitle })
		.click();

	await expect(page).toHaveURL(routes.postsIndex);
	expect(
		await page.evaluate(() => 'survivesSwap' in window),
		'the swap reloaded the document',
	).toBe(true);

	await page.getByRole('button', { name: t('search.toggle.label') }).click();
	await expect(page.locator('pagefind-input input')).toBeVisible();
});
