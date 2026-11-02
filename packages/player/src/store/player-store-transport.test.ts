import type { StoreApi } from 'zustand/vanilla';

import { beforeEach, describe, expect, test, vi } from 'vitest';

import type { PlayerStore } from '#store/player-store.ts';

import {
	configured,
	fake,
	makeItem,
	pendingResolver,
	release,
	resetEngine,
} from '#test/player-store.ts';

beforeEach(resetEngine);

describe('next', () => {
	test('stops at the end without wrapping', () => {
		const store = configured();

		store.getState().playTrack(release, 'c');
		store.getState().next();

		expect(store.getState().currentIndex).toBe(2);
		expect(store.getState().status).toBe('idle');
	});
});

describe('previous', () => {
	test('restarts the current track when past the threshold', () => {
		const store = configured();

		store.getState().playTrack(release, 'b');
		fake.setTime(5);
		store.getState().previous();

		expect(store.getState().currentIndex).toBe(1);
		expect(fake.engine.seek).toHaveBeenCalledWith(0);
	});

	test('writes the restart back to the store, since a paused clock gets no update', () => {
		const store = configured();

		store.getState().playTrack(release, 'b');
		fake.setTime(5);
		fake.callbacks.current?.onTime(5);
		store.getState().previous();

		expect(store.getState().currentTimeSeconds).toBe(0);
	});

	test('restarts at the head of the queue', () => {
		const store = configured();

		store.getState().playTrack(release, 'a');
		fake.setTime(1);
		store.getState().previous();

		expect(store.getState().currentIndex).toBe(0);
		expect(fake.engine.seek).toHaveBeenCalledWith(0);
	});
});

describe('shuffle', () => {
	test('steps along the shuffled order in both directions, not the queue order', () => {
		const random = vi.spyOn(Math, 'random').mockReturnValue(0);
		const store = configured();

		store.getState().playTrack(release, 'a');
		store.getState().toggleShuffle();
		expect(store.getState().playOrder).toStrictEqual([0, 2, 1]);

		store.getState().next();
		expect(store.getState().currentIndex).toBe(2);

		fake.setTime(1);
		store.getState().previous();
		expect(store.getState().currentIndex).toBe(0);

		random.mockRestore();
	});
});

describe('transport', () => {
	// The loaded track keeps its index only until a row above it goes, and reloading it would restart the sound
	test('pauses rather than reloads after a row above the loaded track is removed', () => {
		const store = configured();

		store.getState().playTrack(release, 'b');
		fake.callbacks.current?.onStatus('playing');
		store.getState().removeAt(0);
		store.getState().togglePaused();

		expect(fake.engine.pause).toHaveBeenCalled();
	});

	test('resumes the engine when toggled while paused', () => {
		const store = configured();

		store.getState().playTrack(release, 'a');
		fake.callbacks.current?.onStatus('paused');
		store.getState().togglePaused();

		expect(fake.engine.play).toHaveBeenCalled();
	});

	test('starts the first play-order track when nothing is loaded', () => {
		const store = configured();

		store.getState().playTrack(release, 'a');
		store.getState().removeAt(0);
		expect(store.getState().currentIndex).toBeUndefined();

		store.getState().togglePaused();
		expect(store.getState().currentIndex).toBe(0);
	});

	test('seeks by a delta, clamped into the loaded track', () => {
		const store = configured();

		store.getState().playTrack(release, 'a');
		fake.callbacks.current?.onTime(100);
		store.getState().seekBy(30);

		expect(store.getState().currentTimeSeconds).toBe(130);

		store.getState().seekBy(120);

		expect(store.getState().currentTimeSeconds).toBe(180);

		store.getState().seekBy(-500);

		expect(store.getState().currentTimeSeconds).toBe(0);
	});

	test('ignores a delta while no duration is known', () => {
		const store = configured();

		const { durationMs: _durationMs, ...unmeasured } = makeItem('a');

		store.getState().playTrack([unmeasured], 'a');
		fake.callbacks.current?.onTime(10);
		store.getState().seekBy(30);

		expect(store.getState().currentTimeSeconds).toBe(10);
	});

	test.each([
		[
			'the end of the play order',
			(store: StoreApi<PlayerStore>) => {
				store.getState().playAt(2);
				store.getState().next();
			},
		],
		[
			'clearing the queue',
			(store: StoreApi<PlayerStore>) => {
				store.getState().clearQueue();
			},
		],
	])('%s stays idle when the element reports its pause late', (_label, drop) => {
		const store = configured();

		store.getState().playTrack(release, 'a');
		fake.callbacks.current?.onStatus('playing');
		drop(store);
		fake.callbacks.current?.onStatus('paused');

		expect(store.getState().status).toBe('idle');
	});
});

describe('resume', () => {
	test('a press on a load paused while it resolved reads as loading until the element answers', async () => {
		const { answer, store } = pendingResolver();

		store.getState().playTrack(release, 'a');
		store.getState().pause();
		store.getState().play();

		expect(store.getState()).toMatchObject({ isPaused: false, status: 'loading' });

		answer('a');
		await vi.waitFor(() => {
			expect(fake.engine.load).toHaveBeenCalledOnce();
		});
	});

	test('a press on a loaded pause leaves the status to the element', async () => {
		const store = configured();

		store.getState().playTrack(release, 'a');
		await vi.waitFor(() => {
			expect(fake.engine.load).toHaveBeenCalledOnce();
		});
		fake.callbacks.current?.onStatus('paused');
		store.getState().play();

		expect(store.getState()).toMatchObject({ isPaused: false, status: 'paused' });
	});
});
