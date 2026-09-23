import { expect, expectAdvancing, test } from '#e2e/test.ts';

test('a router swap without moveBefore keeps the open panel and playback bound', async ({
	harness,
	page,
}) => {
	await harness.open();
	await page.getByRole('button', { name: 'Play long' }).click();
	await expectAdvancing(harness, 1);

	await page.evaluate(() => window.playerPage?.store.getState().setPanelOpen(true));

	const canvas = await page.locator('.player-panel-canvas').elementHandle();

	await page.evaluate(() => {
		const root = document.querySelector('player-root');
		const host = root?.parentElement;
		if (!root || !host) throw new Error('The player is not mounted');

		const target = document.createElement('div');

		document.documentElement.append(root);
		host.append(target);
		target.replaceWith(root);
	});

	expect(
		await page.evaluate(
			(before) => document.querySelector('.player-panel-canvas') === before,
			canvas,
		),
	).toBe(true);
	expect(await harness.read()).toMatchObject({ isPaused: false, status: 'playing' });
});
