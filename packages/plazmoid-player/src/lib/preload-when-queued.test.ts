import type { Track } from '@xsynaptic/plazmoid-core';

import { createMemoryStorage, createPlayerStore } from '@xsynaptic/plazmoid-core';
import { afterEach, describe, expect, test, vi } from 'vitest';

import { preloadWhenQueued } from '#lib/preload-when-queued.ts';

const track = {
	artistLine: 'Nebula Drift',
	durationMs: 180_000,
	releaseTitle: 'Cosmic Drift',
	title: 'Track a',
	trackId: 'a',
} satisfies Track;

function stubIdle() {
	const pending: Array<() => void> = [];
	const cancel = vi.fn();

	vi.stubGlobal('requestIdleCallback', (callback: () => void) => {
		pending.push(callback);

		return pending.length;
	});
	vi.stubGlobal('cancelIdleCallback', cancel);

	return { cancel, pending };
}

afterEach(() => {
	vi.unstubAllGlobals();
	localStorage.clear();
});

describe('preloadWhenQueued', () => {
	test('waits for a queue, then preloads once when the page is idle', () => {
		const idle = stubIdle();
		const store = createPlayerStore({ storage: createMemoryStorage() });
		const preload = vi.fn();

		preloadWhenQueued(store, preload);

		expect(idle.pending).toHaveLength(0);

		store.getState().loadQueue([track]);
		store.getState().loadQueue([track, { ...track, trackId: 'b' }]);

		expect(idle.pending).toHaveLength(1);
		expect(preload).not.toHaveBeenCalled();

		idle.pending[0]?.();

		expect(preload).toHaveBeenCalledOnce();
	});

	test('a queue already restored schedules at once, and unbinding before idle cancels it', () => {
		const idle = stubIdle();
		const store = createPlayerStore({ storage: createMemoryStorage() });
		const preload = vi.fn();

		store.getState().loadQueue([track]);

		const unbind = preloadWhenQueued(store, preload);

		expect(idle.pending).toHaveLength(1);

		unbind();

		expect(idle.cancel).toHaveBeenCalledOnce();
	});
});
