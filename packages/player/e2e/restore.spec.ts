import { expect, expectAdvancing, test } from '#e2e/test.ts';
import { labels } from '#test/labels.ts';

test('a reload restores the queue without playing, and a press resumes where it stood', async ({
	harness,
	page,
}) => {
	await harness.open();
	await page.getByRole('button', { name: 'Play long' }).click();
	await expectAdvancing(harness, 1);
	await page.evaluate(() => {
		window.playerPage?.store.getState().seek(20);
	});
	await expectAdvancing(harness, 20);

	await page.reload();
	await harness.waitForBind();
	await expect(page.getByText('Long fixture')).toBeVisible();
	await expect(page.getByRole('button', { exact: true, name: labels.play })).toBeVisible();

	// Anything that autoplays does so as the root connects, well inside this
	await page.waitForTimeout(1500);

	const restored = await harness.read();

	expect(restored.currentIndex).toBe(0);
	expect(restored.currentTimeSeconds).toBeGreaterThan(19);
	expect(restored.isPaused).toBe(true);
	expect(restored.element).toBeUndefined();
	expect(await harness.observed()).toMatchObject({ audioCount: 0, playCalls: 0 });

	await page.getByRole('button', { exact: true, name: labels.play }).click();
	await expect.poll(() => harness.read()).toMatchObject({ status: 'playing' });

	const { element } = await harness.read();
	const resumedAt = element?.currentTime ?? 0;

	expect(Math.abs(resumedAt - restored.currentTimeSeconds)).toBeLessThan(3);
	await expectAdvancing(harness, resumedAt + 1);
});

test('storage that throws on every call leaves playback working', async ({ harness, page }) => {
	await page.addInitScript(() => {
		const methods = ['clear', 'getItem', 'key', 'removeItem', 'setItem'] as const;

		for (const method of methods) {
			Object.defineProperty(Storage.prototype, method, {
				value: () => {
					throw new DOMException('The operation is insecure.', 'SecurityError');
				},
			});
		}
	});

	await harness.open();
	await page.getByRole('button', { name: 'Play long' }).click();

	await expectAdvancing(harness, 1);
	expect(await harness.read()).toMatchObject({ status: 'playing' });
});
