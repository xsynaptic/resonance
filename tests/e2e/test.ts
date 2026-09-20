import type { Page, Response, Route } from '@playwright/test';

import { test as base, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';

import type { SitePaths } from '#e2e/site-paths.ts';

import {
	audioFixturePath,
	getBaseUrl,
	listenUrlPattern,
	streamUrlPattern,
} from '#e2e/constants.ts';
import { getSitePaths } from '#e2e/site-paths.ts';

export { expect } from '@playwright/test';

interface ConsoleGuard {
	allow: (...patterns: Array<RegExp>) => void;
}

interface ListenBeacon {
	id: string;
	mixId: string;
	seconds: number;
}

// Lowercase as nginx serves it; the player probes for the capital spelling itself
const streamType = 'audio/mp4; codecs="opus"';

const allowedHost = new URL(getBaseUrl()).host;

let audioFixture: Buffer | undefined;

// One range from a start, the only shape a media element asks for
async function fulfillAudio(route: Route): Promise<void> {
	if (!audioFixture) audioFixture = await readFile(audioFixturePath);

	const size = audioFixture.length;
	const header = route.request().headers().range;
	const match = header === undefined ? undefined : /^bytes=(\d+)-(\d*)$/.exec(header);

	if (!match) {
		await route.fulfill({
			body: audioFixture,
			contentType: streamType,
			headers: { 'accept-ranges': 'bytes' },
		});
		return;
	}

	const [, startText = '', endText = ''] = match;
	const start = Number(startText);
	const end = endText === '' ? size - 1 : Math.min(Number(endText), size - 1);

	await route.fulfill({
		body: audioFixture.subarray(start, end + 1),
		contentType: streamType,
		headers: {
			'accept-ranges': 'bytes',
			'content-range': `bytes ${String(start)}-${String(end)}/${String(size)}`,
		},
		status: 206,
	});
}

// `astro preview` has no Worker behind this path, and prod mode must never write a Listen
async function fulfillListen(route: Route, beacons: Array<ListenBeacon>): Promise<void> {
	const body = route.request().postData();

	if (body !== null) beacons.push(JSON.parse(body) as ListenBeacon);

	await route.fulfill({ status: 204 });
}

export const test = base.extend<{
	consoleGuard: ConsoleGuard;
	listens: Array<ListenBeacon>;
	site: SitePaths;
}>({
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

	// eslint-disable-next-line no-empty-pattern -- Playwright rejects a fixture whose first parameter is not destructured
	listens: async ({}, use) => {
		await use([]);
	},

	page: async ({ listens, page }, use) => {
		// Registered first so the two below win; fulfilled empty because an abort logs a console error
		await page.route(
			(url) => url.host !== allowedHost,
			(route) => route.fulfill({ body: '', status: 204 }),
		);
		await page.route(streamUrlPattern, fulfillAudio);
		await page.route(listenUrlPattern, (route) => fulfillListen(route, listens));

		await use(page);
	},

	site: async ({ request }, use) => {
		await use(await getSitePaths(request));
	},
});

export function visit(page: Page, path: string): Promise<null | Response> {
	return page.goto(path, { waitUntil: 'domcontentloaded' });
}
