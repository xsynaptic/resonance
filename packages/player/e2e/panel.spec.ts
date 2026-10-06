import { expect, test } from '#e2e/test.ts';
import { labels } from '#test/labels.ts';

const headerRange = 'bytes=0-19';

// The placeholder animates otherwise, and its frames ask again whether or not the promise settles
test.use({ reducedMotion: 'reduce' });

test('a paused panel asks again for a chunk that failed, and paints it with no input', async ({
	consoleGuard,
	harness,
	isMobile,
	page,
}) => {
	const waveform = page.locator('sonic-waveform:has(:visible)');
	const readPending = () => waveform.evaluate((element) => element.matches(':state(pending)'));
	let chunkRequests = 0;

	consoleGuard.allow(
		/Failed to load resource/,
		/due to access control checks/,
		/Cross-Origin Request Blocked/,
	);

	await page.route(/\.dat\?/, async (route) => {
		const { range } = route.request().headers();

		if (range === headerRange || route.request().method() !== 'GET') {
			await route.continue();
			return;
		}

		chunkRequests += 1;

		if (chunkRequests === 1) await route.abort();
		else await route.continue();
	});

	await harness.open({ archive: 1 });
	await page.getByRole('button', { name: 'Play long' }).click();
	await page.getByRole('button', { exact: true, name: labels.pause }).click();
	if (isMobile) await page.getByRole('button', { exact: true, name: labels.expand }).click();
	await page.evaluate(() => window.playerPage?.store.getState().setPanelOpen(true));

	await expect.poll(readPending).toBe(true);
	expect(chunkRequests).toBe(1);
	await expect(waveform).not.toHaveJSProperty('pending', []);

	await expect.poll(readPending, { timeout: 10_000 }).toBe(false);
	expect(chunkRequests).toBe(2);
	await expect(waveform).toHaveJSProperty('pending', []);
	expect(await harness.read()).toMatchObject({ isPaused: true });
});
