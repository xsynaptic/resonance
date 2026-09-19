import { test } from '#e2e/test.ts';

test('capabilities', async ({ page }, testInfo) => {
	await page.goto('/');

	const capabilities = await page.evaluate(() => {
		const probe = document.createElement('audio');

		return {
			audioSession: 'audioSession' in navigator,
			canPlayType: Object.fromEntries(
				['audio/mp4', 'audio/mp4; codecs="Opus"', 'audio/mp4; codecs="opus"'].map((type) => [
					type,
					probe.canPlayType(type),
				]),
			),
			mediaSession: 'mediaSession' in navigator,
			requestIdleCallback: 'requestIdleCallback' in window,
			userAgent: navigator.userAgent,
		};
	});

	await testInfo.attach('capabilities.json', {
		body: JSON.stringify(capabilities, undefined, '\t'),
		contentType: 'application/json',
	});
});
