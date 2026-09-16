import { afterEach, describe, expect, test, vi } from 'vitest';

import type { QueueItem } from '#types.ts';

import { preloadWhenQueued } from '#lib/preload-when-queued.ts';
import { createPlayerStore } from '#store/player-store.ts';

const item = {
	albumLoudness: {},
	artistLine: 'Nebula Drift',
	durationMs: 180_000,
	itemId: 'a',
	loudness: {},
	releaseTitle: 'Cosmic Drift',
	title: 'Track a',
} satisfies QueueItem;

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
		const store = createPlayerStore();
		const preload = vi.fn();

		preloadWhenQueued(store, preload);

		expect(idle.pending).toHaveLength(0);

		store.getState().loadQueue([item]);
		store.getState().loadQueue([item, { ...item, itemId: 'b' }]);

		expect(idle.pending).toHaveLength(1);
		expect(preload).not.toHaveBeenCalled();

		idle.pending[0]?.();

		expect(preload).toHaveBeenCalledOnce();
	});

	test('a queue already restored schedules at once, and unbinding before idle cancels it', () => {
		const idle = stubIdle();
		const store = createPlayerStore();
		const preload = vi.fn();

		store.getState().loadQueue([item]);

		const unbind = preloadWhenQueued(store, preload);

		expect(idle.pending).toHaveLength(1);

		unbind();

		expect(idle.cancel).toHaveBeenCalledOnce();
	});
});
