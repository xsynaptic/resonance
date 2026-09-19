import { expect, expectAdvancing, test } from '#e2e/test.ts';

declare global {
	interface Window {
		mediaSessionCalls?: { actions: Array<string>; positionReports: number };
	}
}

const boundActions = [
	'nexttrack',
	'pause',
	'play',
	'previoustrack',
	'seekbackward',
	'seekforward',
	'seekto',
];

test.beforeEach(async ({ harness, page }) => {
	await page.addInitScript(() => {
		if (!('mediaSession' in navigator)) return;

		const session = navigator.mediaSession;
		const calls = { actions: new Array<string>(), positionReports: 0 };
		const nativeSetActionHandler = session.setActionHandler.bind(session);
		const nativeSetPositionState = session.setPositionState.bind(session);

		// On the prototype, since WebKit can collect the session's wrapper and hand back a fresh one without overrides
		Object.defineProperty(window, 'mediaSessionCalls', { value: calls });
		MediaSession.prototype.setActionHandler = (action, handler) => {
			nativeSetActionHandler(action, handler);
			if (handler) calls.actions.push(action);
		};
		MediaSession.prototype.setPositionState = (state) => {
			calls.positionReports += 1;
			nativeSetPositionState(state);
		};
	});
	await harness.open();
	test.skip(
		!(await page.evaluate(() => 'mediaSession' in navigator)),
		'This engine has no Media Session',
	);
});

test('the metadata carries the item, with one typed artwork entry', async ({ harness, page }) => {
	await page.getByRole('button', { name: 'Play long' }).click();
	await expectAdvancing(harness, 1);

	const metadata = await page.evaluate(() => {
		const current = navigator.mediaSession.metadata;

		return (
			current && {
				artist: current.artist,
				artwork: current.artwork.map(({ sizes, src, type }) => ({ sizes, src, type })),
				title: current.title,
			}
		);
	});

	expect(metadata).toEqual({
		artist: 'Fixture Artist',
		artwork: [
			{ sizes: '512x512', src: expect.stringContaining('/art.png') as unknown, type: 'image/png' },
		],
		title: 'Long fixture',
	});
});

test('steady playback reports its position rarely', async ({ harness, page }) => {
	await page.getByRole('button', { name: 'Play long' }).click();
	await expectAdvancing(harness, 1);

	const readReports = (): Promise<number> =>
		page.evaluate(() => window.mediaSessionCalls?.positionReports ?? 0);
	const before = await readReports();

	await page.waitForTimeout(10_000);

	expect(await harness.read()).toMatchObject({ status: 'playing' });
	const after = await readReports();

	expect(after - before).toBeLessThanOrEqual(3);
});

test('every action the player binds has a handler', async ({ page }) => {
	const actions = await page.evaluate(() => window.mediaSessionCalls?.actions ?? []);

	expect(actions.toSorted((first, second) => first.localeCompare(second))).toEqual(boundActions);
});
