// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, test, vi } from 'vitest';

const monitor = vi.hoisted(() => ({ monitorPlayback: vi.fn(() => vi.fn()) }));

vi.mock('@xsynaptic/playback-stats', () => monitor);

import { bindPlayerStats } from '#components/player/player-stats.ts';

const optOutKey = 'stats:v1:opt-out';

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

test('an opted-out browser is never monitored', () => {
	localStorage.setItem(optOutKey, '1');

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
