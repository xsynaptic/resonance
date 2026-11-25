// @vitest-environment happy-dom
import type { PlaybackMedia, PlaybackOptions } from '@xsynaptic/plazmoid-stats';

import { afterEach, beforeEach, expect, test, vi } from 'vitest';

const monitor = vi.hoisted(() => ({
	monitorPlayback: vi.fn((_media: PlaybackMedia, _options: PlaybackOptions) => vi.fn()),
}));

vi.mock('@xsynaptic/plazmoid-stats', () => monitor);

import { statsOptOutStorageKey } from '#components/main/main-storage-keys.ts';
import { bindPlayerStats } from '#components/player/player-stats.ts';

function storeWithElement() {
	const element = document.createElement('audio');

	return {
		getState: () => ({
			currentIndex: 0,
			getMediaElement: () => element,
			queue: [{ trackId: 'a-mix' }],
		}),
	} as unknown as Parameters<typeof bindPlayerStats>[0];
}

// A production build is what ships; without this the DEV guard returns first and every assertion passes for the wrong reason
beforeEach(() => {
	vi.stubEnv('DEV', false);
});

afterEach(() => {
	localStorage.clear();
	vi.clearAllMocks();
	vi.unstubAllEnvs();
	vi.unstubAllGlobals();
});

test('a playing element is monitored under the loaded track', async () => {
	await bindPlayerStats(storeWithElement());

	expect(monitor.monitorPlayback).toHaveBeenCalledOnce();
	expect(monitor.monitorPlayback.mock.calls[0]?.[1]?.identify()).toBe('a-mix');
});

test('a report goes out whole as the beacon, its duration included for the short-track rule', async () => {
	const beacon = vi.fn((_url: string, _body: string): void => undefined);

	vi.stubGlobal('navigator', { sendBeacon: beacon });
	await bindPlayerStats(storeWithElement());

	const onReport = monitor.monitorPlayback.mock.calls[0]?.[1]?.onReport;

	const report = { durationSeconds: 20, heardSeconds: 19, listenId: 'listen-1', trackId: 'a-mix' };

	onReport?.(report);

	expect(beacon).toHaveBeenCalledOnce();

	const [url, body] = beacon.mock.calls[0] ?? [];

	expect(url).toBe('/api/listen');
	expect(JSON.parse(String(body))).toStrictEqual(report);
});

test('an opted-out browser is never monitored', async () => {
	localStorage.setItem(statsOptOutStorageKey, '1');

	await bindPlayerStats(storeWithElement());

	expect(monitor.monitorPlayback).not.toHaveBeenCalled();
});

test('Do Not Track is never monitored', async () => {
	vi.stubGlobal('navigator', { doNotTrack: '1' });

	await bindPlayerStats(storeWithElement());

	expect(monitor.monitorPlayback).not.toHaveBeenCalled();
});
