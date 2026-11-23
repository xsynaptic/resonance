import { beforeEach, describe, expect, test, vi } from 'vitest';

import type { StreamResolution } from '#types.ts';

import {
	configured,
	fake,
	makeTrack,
	release,
	resetEngine,
	withResolver,
} from '#test/player-store.ts';

beforeEach(resetEngine);

describe('playTrack', () => {
	test('loads the whole release and starts at the clicked track when the queue is empty', async () => {
		const store = configured();

		store.getState().playTrack(release, 'b');

		const state = store.getState();

		expect(state.queue).toHaveLength(3);
		expect(state.currentIndex).toBe(1);

		await vi.waitFor(() => {
			expect(fake.engine.load).toHaveBeenCalledWith({
				resumeAtSeconds: 0,
				src: 'https://api.test/tracks/b/stream',
			});
		});
	});

	test('toggles transport when the clicked track is already loaded', async () => {
		const store = configured();

		store.getState().playTrack(release, 'a');
		await vi.waitFor(() => {
			expect(fake.engine.load).toHaveBeenCalledOnce();
		});
		fake.callbacks.current?.onStatus('playing');
		store.getState().playTrack(release, 'a');

		expect(store.getState()).toMatchObject({ currentIndex: 0, isPaused: true });
		expect(store.getState().queue).toHaveLength(3);
		expect(fake.engine.pause).toHaveBeenCalled();

		await new Promise((resolve) => setTimeout(resolve, 0));

		expect(fake.engine.load).toHaveBeenCalledOnce();
	});
});

describe('playQueue', () => {
	test('replaces a running queue and plays the new one from the top', () => {
		const store = configured();

		store.getState().playTrack(release, 'b');
		store.getState().playQueue([makeTrack('x'), makeTrack('y')]);

		const state = store.getState();

		expect(state.queue.map((track) => track.trackId)).toStrictEqual(['x', 'y']);
		expect(state.currentIndex).toBe(0);
		expect(fake.engine.reset).toHaveBeenCalledOnce();
	});

	test('ignores an empty list rather than clearing what is loaded', () => {
		const store = configured();

		store.getState().playTrack(release, 'b');
		store.getState().playQueue([]);

		expect(store.getState().queue).toHaveLength(3);
		expect(store.getState().currentIndex).toBe(1);
	});
});

describe('queueTrack', () => {
	test('appends the clicked track without loading or playing it', () => {
		const store = configured();

		store.getState().loadQueue([makeTrack('x')]);
		store.getState().queueTrack(release, 'c');

		const state = store.getState();

		expect(state.queue).toHaveLength(2);
		expect(state.queue[1]?.trackId).toBe('c');
		expect(state.currentIndex).toBeUndefined();
		expect(state.status).toBe('idle');
		expect(fake.engine.load).not.toHaveBeenCalled();
	});
});

describe('queue editing', () => {
	test('stops playback when the loaded track is removed', () => {
		const store = configured();

		store.getState().playTrack(release, 'b');
		store.getState().removeAt(1);

		const state = store.getState();

		expect(state.queue).toHaveLength(2);
		expect(state.currentIndex).toBeUndefined();
		expect(state.status).toBe('idle');
		expect(fake.engine.reset).toHaveBeenCalled();
	});

	test('replacing the queue while playing unloads the engine and leaves it idle', () => {
		const store = configured();

		store.getState().playTrack(release, 'a');
		fake.callbacks.current?.onStatus('playing');
		store.getState().loadQueue([makeTrack('x')]);

		expect(fake.engine.reset).toHaveBeenCalled();
		expect(store.getState()).toMatchObject({
			currentIndex: undefined,
			isPaused: true,
			status: 'idle',
		});
	});

	test('gives every enqueued track an id, including a second copy of the same track', () => {
		const store = configured();

		store.getState().loadQueue([...release, ...release]);

		const ids = store.getState().queue.map((track) => track.queueId);

		expect(ids).toHaveLength(6);
		expect(new Set(ids).size).toBe(6);
	});

	test('drops a resolve in flight when the loaded track is removed', async () => {
		const { promise, resolve } = Promise.withResolvers<StreamResolution>();
		const store = withResolver(() => promise);

		store.getState().playTrack(release, 'a');
		store.getState().removeAt(0);
		resolve({ sources: [{ url: 'https://api.test/tracks/a/stream' }], status: 'ok' });
		await Promise.resolve();

		expect(fake.engine.load).not.toHaveBeenCalled();
	});
});
