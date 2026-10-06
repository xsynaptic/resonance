import { expect, test } from '#e2e/test.ts';
import { labels } from '#test/labels.ts';

test.skip(({ isMobile }) => isMobile, 'The mini layout has no waveform to drag');

test('a mouse drag reads out the held time, and one let go past the cancel zone seeks nowhere', async ({
	harness,
	page,
}) => {
	const bar = page.getByRole('region', { name: labels.nowPlaying });
	const slider = bar.getByRole('slider', { name: labels.seek });
	const bubble = bar.locator('.player-cue-label');

	await harness.open({ cued: 1 });
	await page.getByRole('button', { name: 'Play long' }).click();
	await expect(slider).not.toHaveAttribute('aria-valuemax', '0');
	await page.getByRole('button', { exact: true, name: labels.pause }).click();

	const { currentTimeSeconds: before } = await harness.read();
	const box = await slider.boundingBox();
	if (!box) throw new Error('The waveform has no box to press');

	const y = box.y + box.height * 0.75;

	await page.mouse.move(box.x + box.width / 4, y);
	await page.mouse.down();
	await page.mouse.move(box.x + box.width * 0.75, y, { steps: 4 });
	await expect(bubble).toHaveText(/^0:4[45]Cue ArtistCue Title$/);

	await page.mouse.move(box.x + box.width * 0.75, box.y - 100, { steps: 4 });
	await expect(bubble).toBeHidden();

	await page.mouse.up();
	await expect(bubble).toBeHidden();

	const { currentTimeSeconds: after } = await harness.read();

	expect(after).toBeCloseTo(before, 0);
});
