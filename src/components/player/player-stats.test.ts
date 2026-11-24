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
		getState: () => ({ getMediaElement: () => element }),
		subscribe: vi.fn(() => vi.fn()),
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

test('a playing element is monitored', () => {
	bindPlayerStats(storeWithElement(), () => 'a-mix');

	expect(monitor.monitorPlayback).toHaveBeenCalledOnce();
});

test('a report goes out as the beacon the worker reads', () => {
	const beacon = vi.fn((_url: string, _body: string): void => undefined);

	vi.stubGlobal('navigator', { sendBeacon: beacon });
	bindPlayerStats(storeWithElement(), () => 'a-mix');

	const onReport = monitor.monitorPlayback.mock.calls[0]?.[1]?.onReport;

	onReport?.({ heardSeconds: 95, listenId: 'listen-1', trackId: 'a-mix' });

	expect(beacon).toHaveBeenCalledOnce();

	const [url, body] = beacon.mock.calls[0] ?? [];

	expect(url).toBe('/api/listen');
	expect(JSON.parse(String(body))).toEqual({ id: 'listen-1', mixId: 'a-mix', seconds: 95 });
});

test('an element that appears after binding is monitored once', () => {
	const media: { element?: HTMLAudioElement } = {};
	let listener: (() => void) | undefined;
	const notify = (): void => listener?.();
	const store = {
		getState: () => ({ getMediaElement: () => media.element }),
		subscribe: (subscribed: () => void) => {
			listener = subscribed;
			return () => {
				listener = undefined;
			};
		},
	} as unknown as Parameters<typeof bindPlayerStats>[0];

	bindPlayerStats(store, () => 'a-mix');
	notify();

	expect(monitor.monitorPlayback).not.toHaveBeenCalled();

	media.element = document.createElement('audio');
	notify();
	notify();

	expect(monitor.monitorPlayback).toHaveBeenCalledOnce();
	expect(monitor.monitorPlayback.mock.calls[0]?.[0]).toBe(media.element);
});

test('an opted-out browser is never monitored', () => {
	localStorage.setItem(statsOptOutStorageKey, '1');

	const unbind = bindPlayerStats(storeWithElement(), () => 'a-mix');

	expect(monitor.monitorPlayback).not.toHaveBeenCalled();
	expect(() => {
		unbind();
	}).not.toThrow();
});

test('Do Not Track is never monitored', () => {
	vi.stubGlobal('navigator', { doNotTrack: '1' });

	bindPlayerStats(storeWithElement(), () => 'a-mix');

	expect(monitor.monitorPlayback).not.toHaveBeenCalled();
});
