import type { Page } from '@playwright/test';

import type { SitePaths } from '#e2e/site-paths.ts';

import { expect, test, visit } from '#e2e/test.ts';
import { t } from '#lib/i18n/i18n-strings.ts';

interface HostObserved {
	audio: HTMLAudioElement | undefined;
	audioCount: number;
	mediaSessionActions: Record<string, boolean>;
	playCalls: number;
}

declare global {
	interface Window {
		hostObserved?: HostObserved;
	}
}

// `monitorPlayback` sums media time in steps of 2s or less, so 30 heard seconds pass in about 8 wall seconds
const fastPlaybackRate = 4;

const heardSecondsMinimum = 30;

// `loadPlayer` awaits the stylesheet; one second sits inside WebKit's gesture window, which expires by eight
const stylesheetDelayMs = 1000;

test.describe.configure({ timeout: 45_000 });

// The element's own clock, which moves only while audio is really decoding
async function expectAdvancing(page: Page, pastSeconds: number, timeout = 10_000): Promise<void> {
	await expect
		.poll(
			async () => {
				const host = await readHost(page);

				return host.currentTime;
			},
			{ timeout },
		)
		.toBeGreaterThan(pastSeconds);
}

async function expectBarIsPlaying(page: Page): Promise<void> {
	await expect(page.locator('player-root')).toHaveCount(1);
	await expect(page.locator('player-bar')).toHaveCount(1);

	const host = await readHost(page);

	expect(host.audioCount).toBe(1);
	expect(host.metadataTitle).toBeTruthy();
	expect(host.mediaSessionActions).toMatchObject({ pause: true, play: true });
}

async function observe(page: Page, playbackRate = 1): Promise<void> {
	await page.addInitScript(observeHost, playbackRate);
}

// The player suite's `observeAudio`, plus what the host hands Media Session, which the API will not read back
function observeHost(playbackRate: number): void {
	const observed: HostObserved = {
		audio: undefined,
		audioCount: 0,
		mediaSessionActions: {},
		playCalls: 0,
	};
	const audioProxy = new Proxy(window.Audio, {
		construct(target, argumentsList: ConstructorParameters<typeof Audio>) {
			const audio = Reflect.construct(target, argumentsList);
			const nativePlay = audio.play.bind(audio);

			// Loading a resource resets `playbackRate` to `defaultPlaybackRate`, which the engine does after this
			audio.defaultPlaybackRate = playbackRate;
			audio.playbackRate = playbackRate;
			observed.audio = audio;
			observed.audioCount += 1;
			audio.play = () => {
				observed.playCalls += 1;

				return nativePlay();
			};

			return audio;
		},
	});

	Object.defineProperties(window, {
		Audio: { value: audioProxy },
		hostObserved: { value: observed },
	});

	if (!('mediaSession' in navigator)) return;

	const session = navigator.mediaSession;
	const nativeSetActionHandler = session.setActionHandler.bind(session);

	// On the prototype, since WebKit can collect the session's wrapper and hand back a fresh one without the override
	MediaSession.prototype.setActionHandler = (action, handler) => {
		observed.mediaSessionActions[action] = handler !== null;
		nativeSetActionHandler(action, handler);
	};
}

async function playAListenThrough(page: Page, site: SitePaths): Promise<void> {
	await visit(page, site.mixDetail);
	await pressPlay(page);
	await expectAdvancing(page, heardSecondsMinimum + 1, 30_000);

	await page
		.getByRole('region', { name: t('player.nowPlaying') })
		.getByRole('button', { exact: true, name: t('player.pause') })
		.click();
}

function pressPlay(page: Page): Promise<void> {
	return page.locator('[data-play-track]').first().click();
}

function readHost(page: Page) {
	return page.evaluate(() => {
		const observed = window.hostObserved;

		if (!observed) throw new Error('The Audio observer was not installed');

		const metadata = 'mediaSession' in navigator ? navigator.mediaSession.metadata : undefined;

		return {
			audioCount: observed.audioCount,
			currentTime: observed.audio?.currentTime ?? 0,
			mediaSessionActions: observed.mediaSessionActions,
			metadataTitle: metadata?.title,
			playCalls: observed.playCalls,
		};
	});
}

async function readStylesheetUrl(page: Page): Promise<string> {
	const config = await page
		.locator('[data-player-host] script[type="application/json"]')
		.first()
		.textContent();

	if (!config) throw new Error('The player host carries no config');

	return (JSON.parse(config) as { stylesheetUrl: string }).stylesheetUrl;
}

test('playback survives soft navigation', { tag: '@engines' }, async ({ page, site }) => {
	await observe(page);

	const stylesheetUrl = await test.step('a press on the Mix page starts the clock', async () => {
		await visit(page, site.mixDetail);
		await pressPlay(page);
		await expectAdvancing(page, 1);

		return readStylesheetUrl(page);
	});

	await test.step('a second Mix keeps the one bar playing', async () => {
		await page.locator(`a[href="${site.mixDetailNext}"]`).first().click();
		await expect(page).toHaveURL(site.mixDetailNext);
		await expectAdvancing(page, 2);
		await expectBarIsPlaying(page);
	});

	await test.step('a page with no payload keeps the bar and its stylesheet', async () => {
		await page
			.getByRole('navigation', { name: t('nav.primary.label') })
			.getByRole('link', { exact: true, name: 'About' })
			.click();
		await expectAdvancing(page, 3);
		await expectBarIsPlaying(page);
		await expect(page.locator(`head link[href="${stylesheetUrl}"]`)).toHaveCount(1);

		// The custom element is `display: contents`; the stylesheet's own box is the div inside it
		const bar = await page.locator('.player-bar').boundingBox();

		expect(bar?.height ?? 0).toBeGreaterThan(0);
	});
});

test(
	'a press held through the lazy load is replayed and plays',
	{ tag: '@engines' },
	async ({ page, site }) => {
		await observe(page);
		await page.route(/player\..*\.css$/, async (route) => {
			await new Promise((resolve) => setTimeout(resolve, stylesheetDelayMs));
			await route.continue();
		});

		await visit(page, site.mixDetail);
		await pressPlay(page);
		await expectAdvancing(page, 1);

		const host = await readHost(page);

		expect(host.playCalls).toBe(1);
	},
);

test('a listen past 30 heard seconds sends one beacon', async ({ listens, page, site }) => {
	await observe(page, fastPlaybackRate);
	await playAListenThrough(page, site);

	await expect.poll(() => listens.length).toBe(1);
	expect(listens[0]?.mixId).toBe(site.mixDetail.split('/').at(-2));
	expect(listens[0]?.seconds).toBeGreaterThanOrEqual(heardSecondsMinimum);
});
