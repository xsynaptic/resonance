import { expect, test } from '#e2e/test.ts';
import { labels } from '#test/labels.ts';

test.skip(({ isMobile }) => !isMobile, 'The sheet exists only in the phone layout');

test('a sheet dismissed by a drag reopens on screen', async ({ harness, page }) => {
	const opener = page
		.getByRole('dialog', { name: labels.nowPlaying })
		.getByRole('button', { exact: true, name: labels.lists });
	const sheet = page.getByRole('dialog', { name: labels.lists });

	const settled = () =>
		expect.poll(() => sheet.evaluate((element) => element.getAnimations().length)).toBe(0);

	await harness.open();
	await page.getByRole('button', { name: 'Play long' }).click();
	await page.getByRole('button', { exact: true, name: labels.expand }).click();
	await opener.click();
	await expect(sheet).toBeVisible();
	await settled();

	// A press on a button never grabs, so the drag starts on the header row between the tabs and Close
	const from = await sheet.getByRole('tablist').evaluate((tablist) => {
		const row = tablist.parentElement;
		if (!row) throw new Error('The tablist sits in no header row');

		const { bottom, left, right, top } = row.getBoundingClientRect();
		const y = (top + bottom) / 2;

		for (let x = right - 1; x > left; x -= 4) {
			if (document.elementFromPoint(x, y) === row) return { x, y };
		}

		throw new Error('The header row has no bare stretch to grab');
	});

	await page.mouse.move(from.x, from.y);
	await page.mouse.down();
	for (const step of [1, 2, 3, 4]) await page.mouse.move(from.x, from.y + step * 100);
	await page.mouse.up();
	await expect(sheet).toBeHidden();

	await opener.click();
	await expect(sheet).toBeVisible();
	await settled();
	await expect(sheet).toBeInViewport({ ratio: 0.9 });
	expect(await sheet.evaluate((element) => element.style.translate)).toBe('');
});

test('a touch held on the waveform swaps the title block to the Track under it', async ({
	harness,
	page,
}) => {
	const overlay = page.getByRole('dialog', { name: labels.nowPlaying });
	const slider = overlay.getByRole('slider', { name: labels.seek });
	const readout = overlay.locator('.player-scrub-readout');
	const bubble = overlay.locator('.player-cue-label');

	await harness.open({ cued: 1 });
	await page.getByRole('button', { name: 'Play long' }).click();
	await page.getByRole('button', { exact: true, name: labels.expand }).click();
	await expect(slider).not.toHaveAttribute('aria-valuemax', '0');

	const box = await slider.boundingBox();
	if (!box) throw new Error('The waveform has no box to press');

	// Low on the strip, clear of the cue row a press would snap to
	const touch = {
		bubbles: true,
		buttons: 1,
		clientX: box.x + box.width * 0.75,
		clientY: box.y + box.height * 0.75,
		isPrimary: true,
		pointerId: 1,
		pointerType: 'touch',
	};

	await slider.dispatchEvent('pointerdown', touch);
	await expect(readout).toBeVisible();

	const seconds = Number(await slider.getAttribute('aria-valuenow'));

	await expect(readout).toHaveText(`Cue TitleCue Artist0:${String(seconds)}`);
	await expect(bubble).toHaveAttribute('data-above');
	await expect(bubble).toBeHidden();

	await slider.dispatchEvent('pointerup', { ...touch, buttons: 0 });
	await expect(readout).toBeHidden();
	await expect(overlay.getByText('Long fixture')).toBeVisible();
});
