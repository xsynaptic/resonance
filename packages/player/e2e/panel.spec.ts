import type { Page } from '@playwright/test';

import { expect, test } from '#e2e/test.ts';
import { labels } from '#test/labels.ts';

// The placeholder animates otherwise, and its frames ask again whether or not the promise settles
test.use({ reducedMotion: 'reduce' });

const zoomStorageKey = 'player:v1:panel-zoom';

async function openPausedPanel(page: Page, isMobile: boolean): Promise<void> {
	await page.getByRole('button', { name: 'Play long' }).click();
	await page.getByRole('button', { exact: true, name: labels.pause }).click();
	if (isMobile) await page.getByRole('button', { exact: true, name: labels.expand }).click();
	await page.evaluate(() => window.playerPage?.store.getState().setPanelOpen(true));
}

function readZoom(page: Page): Promise<number | undefined> {
	return page.evaluate(() => window.playerPage?.store.getState().panelPxPerSecond);
}

test('a paused panel asks again for a chunk that failed, and paints it with no input', async ({
	consoleGuard,
	harness,
	isMobile,
	page,
}) => {
	const waveform = page.locator('sonic-waveform:has(:visible)');
	const readPending = () =>
		waveform.evaluate((element) => element.querySelector('[data-sonic-pending]') !== null);
	let chunkRequests = 0;

	consoleGuard.allow(
		/Failed to load resource/,
		/due to access control checks/,
		/Cross-Origin Request Blocked/,
	);

	await page.route(/\.dat\?/, async (route) => {
		if (route.request().method() !== 'GET') {
			await route.continue();
			return;
		}

		chunkRequests += 1;

		if (chunkRequests === 1) await route.abort();
		else await route.continue();
	});

	await harness.open({ archive: 1 });
	await openPausedPanel(page, isMobile);

	await expect.poll(readPending).toBe(true);
	expect(chunkRequests).toBe(1);
	await expect(waveform).not.toHaveJSProperty('pending', []);

	await expect.poll(readPending, { timeout: 10_000 }).toBe(false);
	expect(chunkRequests).toBe(2);
	await expect(waveform).toHaveJSProperty('pending', []);
	expect(await harness.read()).toMatchObject({ isPaused: true });

	// A preflight carries no range
	const requests = await harness.requests();
	const archiveRanges = requests
		.filter((request) => request.path.endsWith('.dat') && request.range !== undefined)
		.map((request) => request.range);

	expect(new Set(archiveRanges)).toStrictEqual(new Set(['bytes=20-12019']));
});

test('the zoom keys and a ctrl wheel set the panel scale, and a reload restores it', async ({
	harness,
	isMobile,
	page,
}) => {
	const control = page.locator('sonic-waveform:has(:visible)').getByRole('slider');

	await harness.open({ archive: 1 });
	await openPausedPanel(page, isMobile);

	await control.focus();
	await page.keyboard.press('+');
	await expect.poll(() => readZoom(page)).toBe(89.88);

	await page.keyboard.press('-');
	await page.keyboard.press('-');
	await expect.poll(() => readZoom(page)).toBe(54.52);

	// Playwright has no wheel in mobile WebKit
	if (!isMobile) {
		await control.hover();
		await page.mouse.wheel(0, -100);
		expect(await readZoom(page)).toBe(54.52);

		await page.keyboard.down('Control');
		await page.mouse.wheel(0, -100);
		await page.keyboard.up('Control');
		await expect.poll(() => readZoom(page)).toBeGreaterThan(54.52);
	}

	const zoom = await readZoom(page);

	expect(await page.evaluate((key) => localStorage.getItem(key), zoomStorageKey)).toBe(
		String(zoom),
	);

	await page.reload();
	await harness.waitForBind();
	expect(await readZoom(page)).toBe(zoom);
});

test('a two-finger pinch zooms the panel without seeking', async ({
	browserName,
	harness,
	isMobile,
	page,
}) => {
	test.skip(browserName !== 'chromium', 'Two touch points need the DevTools protocol');

	const control = page.locator('sonic-waveform:has(:visible)').getByRole('slider');
	const devtools = await page.context().newCDPSession(page);

	await harness.open({ archive: 1 });
	await openPausedPanel(page, isMobile);

	const box = await control.boundingBox();
	if (!box) throw new Error('The waveform has no box');

	const y = box.y + box.height / 2;
	const middle = box.x + box.width / 2;
	const fingers = (spread: number) => [
		{ id: 1, x: middle - spread, y },
		{ id: 2, x: middle + spread, y },
	];
	const before = await harness.read();

	await devtools.send('Input.dispatchTouchEvent', {
		touchPoints: fingers(40).slice(0, 1),
		type: 'touchStart',
	});
	await devtools.send('Input.dispatchTouchEvent', { touchPoints: fingers(40), type: 'touchStart' });
	await devtools.send('Input.dispatchTouchEvent', { touchPoints: fingers(60), type: 'touchMove' });
	await devtools.send('Input.dispatchTouchEvent', { touchPoints: fingers(80), type: 'touchMove' });
	await devtools.send('Input.dispatchTouchEvent', { touchPoints: [], type: 'touchEnd' });

	await expect.poll(() => readZoom(page)).toBe(140);

	const after = await harness.read();

	expect(after.currentTimeSeconds).toBe(before.currentTimeSeconds);
});
