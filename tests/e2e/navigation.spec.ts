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

test('the keyboard opens a submenu and Escape hands focus back to its toggle', async ({ page }) => {
	await visit(page, '/');

	const nav = page.getByRole('navigation', { name: t('nav.primary.label') });
	const toggle = nav.getByRole('button', { name: exploreTitle });

	// The element writes `aria-controls` once it is listening for clicks and keys
	await expect(toggle).toHaveAttribute('aria-controls');

	const submenu = nav.locator(`[id="${(await toggle.getAttribute('aria-controls')) ?? ''}"]`);

	await toggle.focus();
	await page.keyboard.press('Enter');

	await expect(toggle).toHaveAttribute('aria-expanded', 'true');
	await page.keyboard.press('Tab');
	await expect(submenu.getByRole('link').first()).toBeFocused();

	await page.keyboard.press('Escape');

	await expect(toggle).toHaveAttribute('aria-expanded', 'false');
	await expect(toggle).toBeFocused();
	await expect(submenu).toBeHidden();

	await page.keyboard.press('Space');

	await expect(toggle).toHaveAttribute('aria-expanded', 'true');
	await expect(submenu).toBeVisible();
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

test(
	'a header link navigates client-side and the chrome survives the swap',
	{ tag: '@smoke' },
	async ({ page }) => {
		await visit(page, routes.mixesIndex);

		// A window property dies with its document, where a `load` count races the swap on a slow host
		await page.evaluate(() => Object.assign(window, { survivesSwap: true }));

		await page
			.getByRole('navigation', { name: t('nav.primary.label') })
			.getByRole('link', { exact: true, name: postsTitle })
			.click();

		// The address changes before the new page is fetched and swapped in; the heading marks arrival
		await expect(page.getByRole('heading', { level: 1 })).toHaveText(postsTitle);
		expect(
			await page.evaluate(() => 'survivesSwap' in window),
			'the swap reloaded the document',
		).toBe(true);

		await page.getByRole('button', { name: t('search.toggle.label') }).click();
		await expect(page.locator('pagefind-input input')).toBeVisible();
	},
);
