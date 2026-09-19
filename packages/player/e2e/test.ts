import type { Page } from '@playwright/test';

import { test as base, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';

import { fixtureOrigin, seekSeconds } from '#e2e/constants.ts';
import { labels } from '#test/labels.ts';

export { expect } from '@playwright/test';

type BarControl = 'clearQueue' | 'next' | 'seekForward';

interface ConsoleGuard {
	allow: (...patterns: Array<RegExp>) => void;
}

interface ElementSnapshot {
	currentSrc: string;
	currentTime: number;
	duration: number;
	hasSource: boolean;
	muted: boolean;
	networkState: number;
	paused: boolean;
	volume: number;
}

interface Harness {
	observed: () => Promise<Observed>;
	// `isBound: false` returns at the load event, before a `bindDelay` has let the player bind
	open: (
		parameters?: Record<string, number | string>,
		options?: { isBound?: boolean },
	) => Promise<void>;
	read: () => Promise<PlayerSnapshot>;
	requests: () => Promise<Array<LoggedRequest>>;
	waitForBind: () => Promise<void>;
}

interface LoggedRequest {
	path: string;
	range: string | undefined;
	status: number;
}

interface Observed {
	audioCount: number;
	loadstarts: number;
	playCalls: number;
}

interface PlayerSnapshot {
	currentIndex: number | undefined;
	currentTimeSeconds: number;
	element: ElementSnapshot | undefined;
	isPaused: boolean;
	playbackError: undefined | { itemId: string; stage: string };
	resolveCount: number;
	status: string;
}

declare global {
	interface Window {
		playerObserved?: Observed;
	}
}

// Wraps the constructor and each element's `play()`, so a spec can count them without the player exposing either
function observeAudio(): void {
	const observed = { audioCount: 0, loadstarts: 0, playCalls: 0 };
	const audioProxy = new Proxy(window.Audio, {
		construct(target, argumentsList: ConstructorParameters<typeof Audio>) {
			const audio = Reflect.construct(target, argumentsList);
			const nativePlay = audio.play.bind(audio);

			observed.audioCount += 1;
			audio.addEventListener('loadstart', () => {
				observed.loadstarts += 1;
			});
			audio.play = () => {
				observed.playCalls += 1;

				return nativePlay();
			};

			return audio;
		},
	});

	Object.defineProperties(window, {
		Audio: { value: audioProxy },
		playerObserved: { value: observed },
	});
}

function readAudioState(page: Page): Promise<unknown> {
	return page.evaluate(() => {
		const state = window.playerPage?.store.getState();
		const element = state?.getMediaElement();
		const probe = document.createElement('audio');

		return {
			canPlayType: Object.fromEntries(
				['audio/mp4', 'audio/mp4; codecs="Opus"', 'audio/mp4; codecs="opus"'].map((type) => [
					type,
					probe.canPlayType(type),
				]),
			),
			element: element && {
				buffered: Array.from({ length: element.buffered.length }, (_, index) => [
					element.buffered.start(index),
					element.buffered.end(index),
				]),
				currentSrc: element.currentSrc,
				currentTime: element.currentTime,
				duration: element.duration,
				error: element.error && { code: element.error.code, message: element.error.message },
				networkState: element.networkState,
				paused: element.paused,
				readyState: element.readyState,
			},
			store: state && {
				isPaused: state.isPaused,
				playbackError: state.playbackError,
				status: state.status,
			},
		};
	});
}

function readPlayer(page: Page): Promise<PlayerSnapshot> {
	return page.evaluate(() => {
		const playerPage = window.playerPage;
		if (!playerPage) throw new Error('The player is not bound');

		const state = playerPage.store.getState();
		const element = state.getMediaElement();

		return {
			currentIndex: state.currentIndex,
			currentTimeSeconds: state.currentTimeSeconds,
			element: element && {
				currentSrc: element.currentSrc,
				currentTime: element.currentTime,
				duration: element.duration,
				hasSource: element.hasAttribute('src'),
				muted: element.muted,
				networkState: element.networkState,
				paused: element.paused,
				volume: element.volume,
			},
			isPaused: state.isPaused,
			playbackError: state.playbackError,
			resolveCount: playerPage.resolveCount,
			status: state.status,
		};
	});
}

async function waitForBind(page: Page): Promise<void> {
	await page.waitForFunction(() => window.playerPage !== undefined);
}

export const test = base.extend<{ consoleGuard: ConsoleGuard; harness: Harness }>({
	consoleGuard: [
		async ({ page }, use) => {
			const errors: Array<string> = [];
			const allowed: Array<RegExp> = [];

			page.on('console', (message) => {
				if (message.type() === 'error') errors.push(message.text());
			});
			page.on('pageerror', (error) => {
				errors.push(error.message);
			});

			await use({
				allow: (...patterns) => {
					allowed.push(...patterns);
				},
			});

			const unexpected = errors.filter((error) => allowed.every((pattern) => !pattern.test(error)));

			expect(unexpected, 'unexpected console errors').toEqual([]);
		},
		{ auto: true },
	],

	harness: async ({ page }, use, testInfo) => {
		const run = randomUUID();

		await page.addInitScript(observeAudio);
		await use({
			observed: () =>
				page.evaluate(
					() => window.playerObserved ?? { audioCount: 0, loadstarts: 0, playCalls: 0 },
				),
			open: async (parameters = {}, { isBound = true } = {}) => {
				const query = new URLSearchParams({ run });

				for (const [name, value] of Object.entries(parameters)) query.set(name, String(value));

				await page.goto(`/?${query.toString()}`);

				if (isBound) await waitForBind(page);
			},
			read: () => readPlayer(page),
			requests: async () => {
				const response = await fetch(`${fixtureOrigin}/log?run=${run}`);

				return (await response.json()) as Array<LoggedRequest>;
			},
			waitForBind: () => waitForBind(page),
		});

		if (testInfo.status === testInfo.expectedStatus) return;

		try {
			await testInfo.attach('audio-state.json', {
				body: JSON.stringify(await readAudioState(page), undefined, '\t'),
				contentType: 'application/json',
			});
		} catch {
			// A crashed or closed page has no state left to read
		}
	},
});

// The element's own clock, which moves only while audio is really decoding
export async function expectAdvancing(
	harness: Harness,
	pastSeconds: number,
	timeout = 10_000,
): Promise<void> {
	await expect
		.poll(
			async () => {
				const { element } = await harness.read();

				return element?.currentTime ?? 0;
			},
			{ timeout },
		)
		.toBeGreaterThan(pastSeconds);
}

export async function pressBarControl(page: Page, control: BarControl): Promise<void> {
	const name = control === 'clearQueue' ? labels.addToQueue : labels[control];
	const button = page.getByRole('button', { exact: true, name });

	if (!(await button.isVisible())) {
		await page.evaluate(
			({ action, seconds }) => {
				const state = window.playerPage?.store.getState();
				if (!state) throw new Error('The player is not bound');

				if (action === 'seekForward') state.seekBy(seconds);
				else state[action]();
			},
			{ action: control, seconds: seekSeconds },
		);
		return;
	}

	await button.click();

	if (control === 'clearQueue') {
		await page.getByRole('button', { exact: true, name: labels.clearQueue }).click();
	}
}
