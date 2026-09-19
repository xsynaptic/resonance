import { expect, test } from '#e2e/test.ts';
import { labels } from '#test/labels.ts';

test.skip(({ isMobile }) => !isMobile, 'The sheet exists only in the phone layout');

test('a sheet dismissed by a drag reopens on screen', async ({ harness, page }) => {
	const opener = page
		.getByRole('dialog', { name: labels.nowPlaying })
		.getByRole('button', { exact: true, name: labels.lists });
	const sheet = page.getByRole('dialog', { name: labels.lists });

	await harness.open();
	await page.getByRole('button', { name: 'Play long' }).click();
	await page.getByRole('button', { exact: true, name: labels.expand }).click();
	await opener.click();
	await expect(sheet).toBeVisible();

	// A press on a button never grabs, and the sheet's Close overlaps the row's far end
	const from = await sheet.getByRole('tablist').evaluate((tablist) => {
		const { bottom, left, right, top } = tablist.getBoundingClientRect();
		const y = (top + bottom) / 2;

		for (let x = right - 1; x > left; x -= 4) {
			if (document.elementFromPoint(x, y) === tablist) return { x, y };
		}

		throw new Error('The tab row has no bare stretch to grab');
	});

	await page.mouse.move(from.x, from.y);
	await page.mouse.down();
	for (const step of [1, 2, 3, 4]) await page.mouse.move(from.x, from.y + step * 100);
	await page.mouse.up();
	await expect(sheet).toBeHidden();

	await opener.click();
	await expect(sheet).toBeVisible();
	await expect(sheet).toBeInViewport({ ratio: 0.9 });
	expect(
		await sheet.evaluate((element) => ({
			animations: element.getAnimations().length,
			translate: element.style.translate,
		})),
	).toEqual({ animations: 0, translate: '' });
});
