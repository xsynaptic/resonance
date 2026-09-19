import { heldPressAttribute } from '@xsynaptic/player/constants';

import { expect, expectAdvancing, test } from '#e2e/test.ts';

// Chromium and Firefox let any later `play()` through once the page has been clicked, so only WebKit can refuse a late replay
test.skip(({ browserName }) => browserName !== 'webkit', 'Only WebKit expires the gesture');

test('a press held 1500ms before the player binds is replayed and plays', async ({
	harness,
	page,
}) => {
	await harness.open({ bindDelay: 1500 }, { isBound: false });

	const press = page.getByRole('button', { name: 'Play long' });

	await press.click();
	await expect(press).toHaveAttribute(heldPressAttribute);

	await harness.waitForBind();
	await expect(press).not.toHaveAttribute(heldPressAttribute);
	await expectAdvancing(harness, 1);
});

// Known bug, see .claude/tasks-backlog/player-held-press.md; once fixed this turns red and becomes a spec that plays
test('a press held 8000ms before the player binds is refused by WebKit', async ({
	harness,
	page,
}) => {
	await harness.open({ bindDelay: 8000 }, { isBound: false });
	await page.getByRole('button', { name: 'Play long' }).click();
	await harness.waitForBind();

	await expect
		.poll(() =>
			page.evaluate(() => {
				const diagnostic = window.playerPage?.store.getState().diagnostic;

				return diagnostic?.kind === 'play-rejected' ? diagnostic.name : undefined;
			}),
		)
		.toBe('NotAllowedError');
	expect(await harness.read()).toMatchObject({ isPaused: true, status: 'paused' });
});
