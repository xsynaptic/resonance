import { expect, expectAdvancing, test } from '#e2e/test.ts';
import { labels } from '#test/labels.ts';

test.skip(({ isMobile }) => isMobile, 'The phone layout moves the volume control into the overlay');

test('mute writes muted and leaves the volume alone', async ({ harness, page }) => {
	await harness.open();
	await page.getByRole('button', { name: 'Play long' }).click();
	await expectAdvancing(harness, 1);

	const mute = page.getByRole('button', { exact: true, name: labels.mute });

	// The baseline the read-only spec collapses from: hovering opens the fader
	await mute.hover();
	await expect(page.getByRole('slider', { name: labels.volume })).toBeVisible();

	await mute.click();
	await expect.poll(() => harness.read()).toMatchObject({ element: { muted: true } });
	expect(await harness.read()).toMatchObject({ element: { volume: 1 } });

	await page.getByRole('button', { exact: true, name: labels.unmute }).click();
	await expect.poll(() => harness.read()).toMatchObject({ element: { muted: false } });
	expect(await harness.read()).toMatchObject({ element: { volume: 1 } });
});

test('a read-only volume collapses the control to mute alone', async ({ harness, page }) => {
	await page.addInitScript(() => {
		const native = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'volume');

		Object.defineProperty(HTMLMediaElement.prototype, 'volume', {
			...native,
			set: () => {
				// iOS ignores every write and keeps the old value
			},
		});
	});

	await harness.open();
	await page.getByRole('button', { name: 'Play long' }).click();
	await expectAdvancing(harness, 1);

	const mute = page.getByRole('button', { exact: true, name: labels.mute });

	await mute.hover();
	await expect(page.getByRole('slider', { name: labels.volume })).toBeHidden();

	await mute.click();
	await expect.poll(() => harness.read()).toMatchObject({ element: { muted: true } });
});
