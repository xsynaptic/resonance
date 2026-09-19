import { heldPressAttribute } from '@xsynaptic/player/constants';

import { expect, expectAdvancing, test } from '#e2e/test.ts';

const webkitProjects = new Set(['mobile-webkit', 'webkit']);

for (const bindDelay of [1500, 4000, 8000]) {
	test(`a press held ${String(bindDelay)}ms before the player binds is replayed and plays`, async ({
		harness,
		page,
	}, testInfo) => {
		test.fail(
			bindDelay === 8000 && webkitProjects.has(testInfo.project.name),
			'WebKit refuses a play() this long after the click; see .claude/tasks-backlog/player-held-press.md',
		);

		await harness.open({ bindDelay }, { isBound: false });

		const press = page.getByRole('button', { name: 'Play long' });

		await press.click();
		await expect(press).toHaveAttribute(heldPressAttribute);

		await harness.waitForBind();
		await expect(press).not.toHaveAttribute(heldPressAttribute);
		await expectAdvancing(harness, 1);
	});
}
