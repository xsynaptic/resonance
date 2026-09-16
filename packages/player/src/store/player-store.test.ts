import type { StoreApi } from 'zustand/vanilla';

import { beforeEach, describe, expect, test, vi } from 'vitest';

import type { PlayerStore } from '#store/player-store.ts';
import type { PlayerUrls, QueueItem, StreamResolution } from '#types.ts';

import { createFakeEngine } from '#engine/fake-engine.ts';
import { createPlayerStore } from '#store/player-store.ts';

// Replaced per test, so nothing a store did survives into the next one
let fake = createFakeEngine();

function makeItem(id: string): QueueItem {
	return {
		albumLoudness: {},
		artistLine: 'Nebula Drift',
		durationMs: 180_000,
		loudness: {},
		releaseHref: '/releases/cosmic-drift',
		releaseTitle: 'Cosmic Drift',
		title: `Track ${id}`,
		trackId: id,
	};
}

const release = [makeItem('a'), makeItem('b'), makeItem('c')];

interface StoredQueueRecord {
	currentIndex: number | undefined;
	currentTimeSeconds: number;
	queue: Array<{ trackId: string }>;
}

function configured(): StoreApi<PlayerStore> {
	return withResolver(({ trackId }) =>
		Promise.resolve({ status: 'ok', url: `https://api.test/tracks/${trackId}/stream` }),
	);
}

// The position drifting between queue changes goes out on `pagehide`
function leavePage(): void {
	window.dispatchEvent(new Event('pagehide'));
}

function pendingResolver() {
	const pending = new Map<string, (resolution: StreamResolution) => void>();
	const store = withResolver(
		({ trackId }) =>
			new Promise<StreamResolution>((resolve) => {
				pending.set(trackId, resolve);
			}),
	);

	return {
		answer: (trackId: string) => {
			pending.get(trackId)?.({ status: 'ok', url: `https://api.test/${trackId}` });
		},
		store,
	};
}

function storedQueue(): null | StoredQueueRecord {
	return JSON.parse(localStorage.getItem('player:v2:queue') ?? 'null') as null | StoredQueueRecord;
}

function withResolver(stream: PlayerUrls['stream']): StoreApi<PlayerStore> {
	const store = createPlayerStore({ createEngine: fake.createEngine });

	store.getState().configure({
		urls: {
			stream,
		},
	});

	return store;
}

beforeEach(() => {
	fake = createFakeEngine();
});

describe('playTrack', () => {
	test('loads the whole release and starts at the clicked track when the queue is empty', async () => {
		const store = configured();

		store.getState().playTrack(release, 'b');

		const state = store.getState();

		expect(state.queue).toHaveLength(3);
		expect(state.currentIndex).toBe(1);

		await vi.waitFor(() => {
			expect(fake.engine.load).toHaveBeenCalledWith({
				gain: 1,
				resumeAtSeconds: 0,
				src: 'https://api.test/tracks/b/stream',
			});
		});
	});

	test('hands the engine the gain the loaded item measures at', async () => {
		const store = configured();
		const loudness = { integratedLufs: -12, truePeakDbtp: -2 };

		store.getState().playTrack([{ ...makeItem('hot'), albumLoudness: loudness, loudness }], 'hot');

		await vi.waitFor(() => {
			expect(fake.engine.load).toHaveBeenCalledWith({
				gain: 10 ** (-4 / 20),
				resumeAtSeconds: 0,
				src: 'https://api.test/tracks/hot/stream',
			});
		});
	});

	test('appends the clicked track and jumps to it when a queue is running', () => {
		const store = configured();

		store.getState().loadQueue([makeItem('x')]);
		store.getState().playTrack(release, 'c');

		const state = store.getState();

		expect(state.queue).toHaveLength(2);
		expect(state.currentIndex).toBe(1);
		expect(state.queue[1]?.trackId).toBe('c');
	});

	test('jumps to the queued copy rather than appending a second one', () => {
		const store = configured();

		store.getState().playTrack(release, 'a');
		store.getState().playTrack(release, 'c');

		const state = store.getState();

		expect(state.queue).toHaveLength(3);
		expect(state.currentIndex).toBe(2);
	});

	test('toggles transport when the clicked track is already loaded', () => {
		const store = configured();

		store.getState().playTrack(release, 'a');
		fake.callbacks.current?.onStatus('playing');
		store.getState().playTrack(release, 'a');

		expect(store.getState().queue).toHaveLength(3);
		expect(store.getState().currentIndex).toBe(0);
		expect(fake.engine.pause).toHaveBeenCalled();
	});
});

describe('playRelease', () => {
	test('loads and plays from the top when the queue is empty', () => {
		const store = configured();

		store.getState().playRelease(release);

		expect(store.getState().currentIndex).toBe(0);
		expect(store.getState().queue).toHaveLength(3);
	});

	test('appends every track and jumps to the first appended when a queue is running', () => {
		const store = configured();

		store.getState().playTrack(release, 'a');
		store.getState().playRelease(release);

		const state = store.getState();

		expect(state.queue).toHaveLength(6);
		expect(state.currentIndex).toBe(3);
	});
});

describe('playQueue', () => {
	test('replaces a running queue and plays the new one from the top', () => {
		const store = configured();

		store.getState().playTrack(release, 'b');
		store.getState().playQueue([makeItem('x'), makeItem('y')]);

		const state = store.getState();

		expect(state.queue.map((item) => item.trackId)).toStrictEqual(['x', 'y']);
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

		store.getState().loadQueue([makeItem('x')]);
		store.getState().queueTrack(release, 'c');

		const state = store.getState();

		expect(state.queue).toHaveLength(2);
		expect(state.queue[1]?.trackId).toBe('c');
		expect(state.currentIndex).toBeUndefined();
		expect(state.status).toBe('idle');
		expect(fake.engine.load).not.toHaveBeenCalled();
	});

	test('leaves the loaded track where it is', () => {
		const store = configured();

		store.getState().loadQueue([makeItem('x')]);
		store.getState().playAt(0);
		store.getState().queueTrack(release, 'c');

		expect(store.getState().currentIndex).toBe(0);
		expect(store.getState().queue.map((item) => item.trackId)).toStrictEqual(['x', 'c']);
	});

	test('leaves a track already queued where it is', () => {
		const store = configured();

		store.getState().playTrack(release, 'a');
		store.getState().queueTrack(release, 'b');

		expect(store.getState().queue).toHaveLength(3);
	});
});

describe('loadQueue', () => {
	test('puts a queue back without playing any of it', () => {
		const store = configured();

		store.getState().loadQueue(release);

		const state = store.getState();

		expect(state.queue).toHaveLength(3);
		expect(state.playOrder).toStrictEqual([0, 1, 2]);
		expect(state.currentIndex).toBeUndefined();
		expect(state.status).toBe('idle');
		expect(fake.engine.load).not.toHaveBeenCalled();
	});

	test('ignores an empty queue rather than clearing what is loaded', () => {
		const store = configured();

		store.getState().playTrack(release, 'b');
		store.getState().loadQueue([]);

		expect(store.getState().queue).toHaveLength(3);
		expect(store.getState().currentIndex).toBe(1);
	});
});

describe('next', () => {
	test('advances along the play order', () => {
		const store = configured();

		store.getState().playTrack(release, 'a');
		store.getState().next();

		expect(store.getState().currentIndex).toBe(1);
	});

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

	test('steps back within the opening seconds', () => {
		const store = configured();

		store.getState().playTrack(release, 'b');
		fake.setTime(1);
		store.getState().previous();

		expect(store.getState().currentIndex).toBe(0);
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

	test('puts the current track first and restores natural order when toggled off', () => {
		const store = configured();

		store.getState().playTrack(release, 'b');
		store.getState().toggleShuffle();

		const shuffled = store.getState();

		expect(shuffled.isShuffling).toBe(true);
		expect(shuffled.playOrder[0]).toBe(1);
		expect(shuffled.playOrder.toSorted((first, second) => first - second)).toStrictEqual([0, 1, 2]);

		store.getState().toggleShuffle();
		expect(store.getState().isShuffling).toBe(false);
		expect(store.getState().playOrder).toStrictEqual([0, 1, 2]);
	});

	test('is unavailable while a sectioned queue is loaded, however it was left', () => {
		const store = configured();

		store.getState().playTrack(release, 'a');
		store.getState().toggleShuffle();
		expect(store.getState().isShuffling).toBe(true);

		store.getState().loadQueue([{ ...makeItem('d'), sectionLabel: 'Darkpsy' }, makeItem('e')]);
		expect(store.getState().isShuffling).toBe(false);
		expect(store.getState().playOrder).toStrictEqual([0, 1]);

		store.getState().toggleShuffle();
		expect(store.getState().isShuffling).toBe(false);
	});
});

describe('queue editing', () => {
	test('shifts the current index down when an earlier track is removed', () => {
		const store = configured();

		store.getState().playTrack(release, 'c');
		expect(store.getState().currentIndex).toBe(2);

		store.getState().removeAt(0);
		expect(store.getState().queue).toHaveLength(2);
		expect(store.getState().currentIndex).toBe(1);
	});

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

	test('swaps out everything after the loaded track', () => {
		const store = configured();

		store.getState().playTrack(release, 'b');
		store.getState().replaceAfter(1, [makeItem('x'), makeItem('y')]);

		const state = store.getState();

		expect(state.queue.map((item) => item.trackId)).toStrictEqual(['a', 'b', 'x', 'y']);
		expect(state.currentIndex).toBe(1);
		expect(state.playOrder).toStrictEqual([0, 1, 2, 3]);
	});

	test('refuses to swap out the loaded track itself', () => {
		const store = configured();

		store.getState().playTrack(release, 'c');
		store.getState().replaceAfter(0, [makeItem('x')]);

		expect(store.getState().queue.map((item) => item.trackId)).toStrictEqual(['a', 'b', 'c']);
	});

	test('clears the queue and resets the engine', () => {
		const store = configured();

		store.getState().playTrack(release, 'a');
		store.getState().clearQueue();

		expect(store.getState().queue).toHaveLength(0);
		expect(store.getState().currentIndex).toBeUndefined();
		expect(fake.engine.reset).toHaveBeenCalled();
	});

	test('gives every enqueued item an id, including a second copy of the same track', () => {
		const store = configured();

		store.getState().loadQueue(release);
		store.getState().playRelease(release);

		const ids = store.getState().queue.map((item) => item.queueId);

		expect(ids).toHaveLength(6);
		expect(new Set(ids).size).toBe(6);
	});

	test('drops a resolve in flight when the loaded track is removed', async () => {
		const { promise, resolve } = Promise.withResolvers<StreamResolution>();
		const store = withResolver(() => promise);

		store.getState().playTrack(release, 'a');
		store.getState().removeAt(0);
		resolve({ status: 'ok', url: 'https://api.test/tracks/a/stream' });
		await Promise.resolve();

		expect(fake.engine.load).not.toHaveBeenCalled();
	});
});

describe('moveItem', () => {
	test('moves the row and leaves the play order following the queue', () => {
		const store = configured();

		store.getState().loadQueue(release);
		store.getState().moveItem(0, 2);

		const state = store.getState();

		expect(state.queue.map((item) => item.trackId)).toStrictEqual(['b', 'c', 'a']);
		expect(state.playOrder).toStrictEqual([0, 1, 2]);
	});

	test('carries the loaded track with it', () => {
		const store = configured();

		store.getState().playTrack(release, 'a');
		store.getState().moveItem(0, 2);

		expect(store.getState().currentIndex).toBe(2);
	});

	test('shifts the loaded track when a row moves past it', () => {
		const store = configured();

		store.getState().playTrack(release, 'b');
		store.getState().moveItem(2, 0);

		expect(store.getState().queue.map((item) => item.trackId)).toStrictEqual(['c', 'a', 'b']);
		expect(store.getState().currentIndex).toBe(2);
	});

	test('leaves the loaded track alone when the move happens beside it', () => {
		const store = configured();

		store.getState().playTrack(release, 'a');
		store.getState().moveItem(1, 2);

		expect(store.getState().currentIndex).toBe(0);
	});

	test('keeps a shuffled sequence in its order rather than reshuffling', () => {
		const store = configured();

		store.getState().loadQueue(release);
		store.setState({ isShuffling: true, playOrder: [2, 0, 1] });
		store.getState().moveItem(0, 2);

		const state = store.getState();

		expect(state.queue.map((item) => item.trackId)).toStrictEqual(['b', 'c', 'a']);
		expect(state.playOrder.map((index) => state.queue[index]?.trackId)).toStrictEqual([
			'c',
			'a',
			'b',
		]);
	});

	test('refuses to reorder a sectioned queue', () => {
		const store = configured();

		store.getState().loadQueue(release.map((item) => ({ ...item, sectionLabel: 'Section' })));
		store.getState().moveItem(0, 2);

		expect(store.getState().queue.map((item) => item.trackId)).toStrictEqual(['a', 'b', 'c']);
	});

	test('refuses an index outside the queue', () => {
		const store = configured();

		store.getState().loadQueue(release);
		store.getState().moveItem(0, 3);
		store.getState().moveItem(-1, 1);

		expect(store.getState().queue.map((item) => item.trackId)).toStrictEqual(['a', 'b', 'c']);
	});
});

describe('transport', () => {
	test('pauses the engine when toggled while playback is intended', () => {
		const store = configured();

		store.getState().playTrack(release, 'a');
		fake.callbacks.current?.onStatus('playing');
		store.getState().togglePaused();

		expect(fake.engine.pause).toHaveBeenCalled();
	});

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

	test('seeks the engine and updates the position', () => {
		const store = configured();

		store.getState().playTrack(release, 'a');
		store.getState().seek(42);

		expect(fake.engine.seek).toHaveBeenCalledWith(42);
		expect(store.getState().currentTimeSeconds).toBe(42);
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

		store.getState().playTrack(release, 'a');
		fake.callbacks.current?.onTime(10);
		fake.callbacks.current?.onDuration(undefined);
		store.getState().seekBy(30);

		expect(store.getState().currentTimeSeconds).toBe(10);
	});

	test('stops playback and resets the engine', () => {
		const store = configured();

		store.getState().playTrack(release, 'a');
		fake.callbacks.current?.onStatus('playing');
		fake.callbacks.current?.onTime(30);
		store.getState().stop();

		expect(fake.engine.reset).toHaveBeenCalled();
		expect(store.getState().status).toBe('idle');
		expect(store.getState().currentTimeSeconds).toBe(0);
	});

	test.each([
		[
			'a stop',
			(store: StoreApi<PlayerStore>) => {
				store.getState().stop();
			},
		],
		[
			'clearing the queue',
			(store: StoreApi<PlayerStore>) => {
				store.getState().clearQueue();
			},
		],
		[
			'removing the loaded track',
			(store: StoreApi<PlayerStore>) => {
				store.getState().removeAt(0);
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

	test('toggles the tray open and closed', () => {
		const store = configured();

		expect(store.getState().isTrayOpen).toBe(false);
		store.getState().toggleTray();
		expect(store.getState().isTrayOpen).toBe(true);
		store.getState().toggleTray();
		expect(store.getState().isTrayOpen).toBe(false);
	});
});

describe('engine errors', () => {
	test('re-resolves once on a failure, then reports the second as an error', async () => {
		const resolved: Array<string> = [];
		const store = withResolver(({ trackId }) => {
			resolved.push(trackId);
			return Promise.resolve({
				status: 'ok',
				url: `https://api.test/tracks/${trackId}/${String(resolved.length)}`,
			});
		});

		store.getState().playTrack(release, 'a');
		await vi.waitFor(() => {
			expect(fake.engine.load).toHaveBeenCalledTimes(1);
		});

		fake.callbacks.current?.onError('network');
		await vi.waitFor(() => {
			expect(fake.engine.load).toHaveBeenCalledTimes(2);
		});
		expect(resolved).toStrictEqual(['a', 'a']);
		expect(store.getState().status).not.toBe('error');

		fake.callbacks.current?.onError('network');
		expect(store.getState().status).toBe('error');
		expect(store.getState().playbackError).toStrictEqual({ stage: 'network', trackId: 'a' });
	});

	test('stops at a capped resolve without loading or re-resolving', async () => {
		const resolved: Array<string> = [];
		const store = withResolver(({ trackId }) => {
			resolved.push(trackId);
			return Promise.resolve({ status: 'capped' });
		});

		store.getState().playTrack(release, 'a');
		await vi.waitFor(() => {
			expect(store.getState().status).toBe('capped');
		});

		expect(fake.engine.load).not.toHaveBeenCalled();
		expect(resolved).toStrictEqual(['a']);
	});

	test('stops at a format the browser cannot play without loading or re-resolving', async () => {
		const resolved: Array<string> = [];
		const store = withResolver(({ trackId }) => {
			resolved.push(trackId);
			return Promise.resolve({
				status: 'ok',
				type: 'audio/mp4; codecs="opus"',
				url: `https://api.test/tracks/${trackId}/stream`,
			});
		});
		fake.engine.canPlay.mockReturnValue(false);

		store.getState().playTrack(release, 'a');
		await vi.waitFor(() => {
			expect(store.getState().status).toBe('unplayable');
		});

		expect(fake.engine.canPlay).toHaveBeenCalledWith('audio/mp4; codecs="opus"');
		expect(fake.engine.load).not.toHaveBeenCalled();
		expect(resolved).toStrictEqual(['a']);
	});

	test('drops a resolve that lands after the listener moved on', async () => {
		const pending = new Map<string, (resolution: StreamResolution) => void>();
		const store = withResolver(
			({ trackId }) =>
				new Promise<StreamResolution>((resolve) => {
					pending.set(trackId, resolve);
				}),
		);

		store.getState().playTrack(release, 'a');
		store.getState().playTrack(release, 'b');

		// The abandoned track answers last, the order that would otherwise pull the queue back
		pending.get('b')?.({ status: 'ok', url: 'https://api.test/b' });
		pending.get('a')?.({ status: 'ok', url: 'https://api.test/a' });

		await vi.waitFor(() => {
			expect(fake.engine.load).toHaveBeenCalledTimes(1);
		});
		expect(fake.engine.load).toHaveBeenCalledWith({
			gain: 1,
			resumeAtSeconds: 0,
			src: 'https://api.test/b',
		});
	});

	test('reloads a failed track where it stood when play is pressed again', async () => {
		const store = configured();

		store.getState().playTrack(release, 'a');
		await vi.waitFor(() => {
			expect(fake.engine.load).toHaveBeenCalledTimes(1);
		});

		fake.callbacks.current?.onError('network');
		await vi.waitFor(() => {
			expect(fake.engine.load).toHaveBeenCalledTimes(2);
		});
		fake.callbacks.current?.onTime(42);
		fake.callbacks.current?.onError('network');
		expect(store.getState().status).toBe('error');

		store.getState().togglePaused();
		await vi.waitFor(() => {
			expect(fake.engine.load).toHaveBeenCalledTimes(3);
		});
		expect(fake.engine.load).toHaveBeenLastCalledWith(
			expect.objectContaining({ resumeAtSeconds: 42 }),
		);
		expect(fake.engine.play).not.toHaveBeenCalled();
	});

	test('enters the error state when the resolve itself never answers', async () => {
		const store = withResolver(() => Promise.reject(new Error('no route')));

		store.getState().playTrack(release, 'a');
		await vi.waitFor(() => {
			expect(store.getState().status).toBe('error');
		});

		expect(fake.engine.load).not.toHaveBeenCalled();
	});
});

describe('play intent', () => {
	test('a pause while the stream resolves hands the engine its source without playing it', async () => {
		const { answer, store } = pendingResolver();

		store.getState().playTrack(release, 'a');
		expect(store.getState().isPaused).toBe(false);

		store.getState().pause();
		answer('a');

		await vi.waitFor(() => {
			expect(fake.engine.load).toHaveBeenCalledWith(
				expect.objectContaining({ src: 'https://api.test/a' }),
			);
		});
		expect(fake.engine.play).not.toHaveBeenCalled();
		expect(store.getState().status).toBe('paused');
		expect(store.getState().isPaused).toBe(true);
	});

	test('a press during a load cancels it, and a second press plays once the source lands', async () => {
		const { answer, store } = pendingResolver();

		store.getState().playTrack(release, 'a');
		store.getState().togglePaused();

		expect(fake.engine.pause).toHaveBeenCalledOnce();
		expect(store.getState().isPaused).toBe(true);

		store.getState().togglePaused();
		answer('a');

		await vi.waitFor(() => {
			expect(fake.engine.load).toHaveBeenCalledOnce();
		});
		expect(store.getState().isPaused).toBe(false);
	});

	test('a seek while the stream resolves carries into the load', async () => {
		const { answer, store } = pendingResolver();

		store.getState().loadQueue(release);
		store.setState({ currentIndex: 1, currentTimeSeconds: 600 });
		store.getState().togglePaused();
		store.getState().seek(100);
		answer('b');

		await vi.waitFor(() => {
			expect(fake.engine.load).toHaveBeenCalledWith(
				expect.objectContaining({ resumeAtSeconds: 100 }),
			);
		});
	});

	test('switching tracks silences the old one before the next resolves', async () => {
		const { answer, store } = pendingResolver();

		store.getState().playTrack(release, 'a');
		answer('a');
		await vi.waitFor(() => {
			expect(fake.engine.load).toHaveBeenCalledTimes(1);
		});
		fake.callbacks.current?.onStatus('playing');

		store.getState().playTrack(release, 'b');

		expect(fake.engine.reset).toHaveBeenCalledOnce();
		expect(fake.engine.load).toHaveBeenCalledTimes(1);
		expect(store.getState().status).toBe('loading');
	});

	test('a pause from outside during a stall lets the lock screen resume in one press', async () => {
		const store = configured();

		store.getState().playTrack(release, 'a');
		await vi.waitFor(() => {
			expect(fake.engine.load).toHaveBeenCalledOnce();
		});
		fake.callbacks.current?.onStatus('playing');
		fake.callbacks.current?.onStatus('loading');
		fake.callbacks.current?.onStatus('paused');

		expect(store.getState().status).toBe('paused');
		expect(store.getState().isPaused).toBe(true);

		store.getState().play();

		expect(fake.engine.play).toHaveBeenCalledOnce();
		expect(store.getState().isPaused).toBe(false);
	});

	test('play never pauses a load already on its way', () => {
		const { store } = pendingResolver();

		store.getState().playTrack(release, 'a');
		store.getState().play();

		expect(fake.engine.pause).not.toHaveBeenCalled();
		expect(store.getState().isPaused).toBe(false);
	});

	test('a pause from outside the player during playback drops the intent', () => {
		const store = configured();

		store.getState().playTrack(release, 'a');
		fake.callbacks.current?.onStatus('playing');
		fake.callbacks.current?.onStatus('paused');

		expect(store.getState().status).toBe('paused');
		expect(store.getState().isPaused).toBe(true);
	});

	test('a failure long into playback retries where playback stood', async () => {
		const store = configured();

		store.getState().playTrack(release, 'a');
		await vi.waitFor(() => {
			expect(fake.engine.load).toHaveBeenCalledTimes(1);
		});
		fake.callbacks.current?.onStatus('playing');
		fake.callbacks.current?.onTime(600);
		fake.callbacks.current?.onError('network');

		await vi.waitFor(() => {
			expect(fake.engine.load).toHaveBeenCalledTimes(2);
		});
		expect(fake.engine.load).toHaveBeenLastCalledWith(
			expect.objectContaining({ resumeAtSeconds: 600 }),
		);
	});

	test('a failure while paused retries without starting playback', async () => {
		const store = configured();

		store.getState().playTrack(release, 'a');
		await vi.waitFor(() => {
			expect(fake.engine.load).toHaveBeenCalledTimes(1);
		});
		fake.callbacks.current?.onStatus('playing');
		store.getState().pause();
		fake.callbacks.current?.onError('network');

		await vi.waitFor(() => {
			expect(fake.engine.load).toHaveBeenCalledTimes(2);
		});
		expect(store.getState().isPaused).toBe(true);
		expect(store.getState().status).toBe('paused');
	});

	test.each([
		['capped', { status: 'capped' }],
		['unplayable', { status: 'ok', type: 'audio/x-unplayable', url: 'https://api.test/a' }],
	] as const)(
		'a press on a %s track re-resolves rather than playing what the engine holds',
		async (status, resolution) => {
			const resolved: Array<string> = [];
			const store = withResolver(({ trackId }) => {
				resolved.push(trackId);
				return Promise.resolve(resolution);
			});
			fake.engine.canPlay.mockReturnValue(false);

			store.getState().playTrack(release, 'a');
			await vi.waitFor(() => {
				expect(store.getState().status).toBe(status);
			});
			expect(store.getState().isPaused).toBe(true);

			store.getState().togglePaused();

			await vi.waitFor(() => {
				expect(resolved).toHaveLength(2);
			});
			expect(fake.engine.play).not.toHaveBeenCalled();
		},
	);
});

describe('volume', () => {
	test('clamps to the 0..1 range', () => {
		const store = configured();

		store.getState().setVolume(1.5);
		expect(store.getState().volume).toBe(1);

		store.getState().setVolume(-0.2);
		expect(store.getState().volume).toBe(0);
	});

	test('restores a stored volume on hydrate', () => {
		localStorage.setItem('player:v1:volume', '0.4');

		const store = configured();

		store.getState().hydratePreferences();
		expect(store.getState().volume).toBe(0.4);

		localStorage.removeItem('player:v1:volume');
	});

	test('mutes without touching the level, silencing the engine meanwhile', () => {
		const store = configured();

		store.getState().playTrack(release, 'a');
		store.getState().setVolume(0.7);

		store.getState().toggleMuted();
		expect(store.getState()).toMatchObject({ isMuted: true, volume: 0.7 });
		expect(fake.engine.setVolume).toHaveBeenLastCalledWith(0);

		store.getState().toggleMuted();
		expect(store.getState()).toMatchObject({ isMuted: false, volume: 0.7 });
		expect(fake.engine.setVolume).toHaveBeenLastCalledWith(0.7);
	});

	test('unmutes a level of zero into a quarter, dragged there or muted there', () => {
		const store = configured();

		store.getState().setVolume(0);
		store.getState().toggleMuted();
		expect(store.getState()).toMatchObject({ isMuted: false, volume: 0.25 });

		store.getState().toggleMuted();
		store.getState().setVolume(0);
		store.getState().toggleMuted();
		expect(store.getState()).toMatchObject({ isMuted: false, volume: 0.25 });
	});

	test('raising the level while muted unmutes at that level', () => {
		const store = configured();

		store.getState().setVolume(0.7);
		store.getState().toggleMuted();
		store.getState().setVolume(0.2);

		expect(store.getState()).toMatchObject({ isMuted: false, volume: 0.2 });
	});

	test('a mute survives a reload and unmutes to the level it held', () => {
		vi.useFakeTimers();

		try {
			const store = configured();

			store.getState().setVolume(0.3);
			store.getState().toggleMuted();
			vi.runAllTimers();

			const reloaded = configured();

			reloaded.getState().hydratePreferences();
			expect(reloaded.getState()).toMatchObject({ isMuted: true, volume: 0.3 });

			reloaded.getState().toggleMuted();
			expect(reloaded.getState()).toMatchObject({ isMuted: false, volume: 0.3 });
		} finally {
			vi.useRealTimers();
			localStorage.removeItem('player:v1:muted');
			localStorage.removeItem('player:v1:volume');
		}
	});
});

describe('time mode', () => {
	test('flips between elapsed and remaining', () => {
		const store = configured();

		expect(store.getState().timeMode).toBe('elapsed');

		store.getState().toggleTimeMode();
		expect(store.getState().timeMode).toBe('remaining');

		store.getState().toggleTimeMode();
		expect(store.getState().timeMode).toBe('elapsed');

		localStorage.removeItem('player:v1:time-mode');
	});

	test('persists the choice and restores it on hydrate', () => {
		configured().getState().toggleTimeMode();

		expect(localStorage.getItem('player:v1:time-mode')).toBe('remaining');

		const restored = configured();

		restored.getState().hydratePreferences();
		expect(restored.getState().timeMode).toBe('remaining');

		localStorage.removeItem('player:v1:time-mode');
	});

	test('ignores a stored value that is not a mode', () => {
		localStorage.setItem('player:v1:time-mode', 'sideways');

		const store = configured();

		store.getState().hydratePreferences();
		expect(store.getState().timeMode).toBe('elapsed');

		localStorage.removeItem('player:v1:time-mode');
	});
});

describe('queue persistence', () => {
	test('writes the queue as it changes, and clears it when the queue empties', () => {
		const store = configured();

		store.getState().hydrateQueue();
		store.getState().playTrack(release, 'b');

		expect(storedQueue()?.queue.map((item) => item.trackId)).toStrictEqual(['a', 'b', 'c']);
		expect(storedQueue()?.currentIndex).toBe(1);

		store.getState().clearQueue();
		expect(localStorage.getItem('player:v2:queue')).toBeNull();
	});

	test('leaves a queue another tab saved when a store that held nothing unloads', () => {
		const store = configured();

		store.getState().hydrateQueue();
		localStorage.setItem('player:v2:queue', JSON.stringify({ queue: release }));
		leavePage();

		expect(storedQueue()?.queue).toHaveLength(3);

		localStorage.removeItem('player:v2:queue');
	});

	test('clears a restored queue once it is emptied', () => {
		const first = configured();

		first.getState().hydrateQueue();
		first.getState().loadQueue(release);

		fake = createFakeEngine();

		const second = configured();

		second.getState().hydrateQueue();
		second.getState().clearQueue();

		expect(localStorage.getItem('player:v2:queue')).toBeNull();
	});

	test('restores the queue and its position without loading anything', () => {
		const first = configured();

		first.getState().hydrateQueue();
		first.getState().playTrack(release, 'b');
		first.getState().seek(42);
		leavePage();

		fake = createFakeEngine();

		const second = configured();

		second.getState().hydrateQueue();

		const state = second.getState();

		expect(state.queue.map((item) => item.trackId)).toStrictEqual(['a', 'b', 'c']);
		expect(state.currentIndex).toBe(1);
		expect(state.currentTimeSeconds).toBe(42);
		expect(state.status).toBe('idle');
		expect(fake.engine.load).not.toHaveBeenCalled();

		localStorage.removeItem('player:v2:queue');
	});

	test('loads a restored track at the stored position on the first press', async () => {
		const first = configured();

		first.getState().hydrateQueue();
		first.getState().playTrack(release, 'b');
		first.getState().seek(42);
		leavePage();

		fake = createFakeEngine();

		const second = configured();

		second.getState().hydrateQueue();
		second.getState().togglePaused();

		await vi.waitFor(() => {
			expect(fake.engine.load).toHaveBeenCalledWith({
				gain: 1,
				resumeAtSeconds: 42,
				src: 'https://api.test/tracks/b/stream',
			});
		});

		localStorage.removeItem('player:v2:queue');
	});

	test('stamps a restored queue with fresh ids rather than the ones it was stored with', () => {
		const first = configured();

		first.getState().hydrateQueue();
		first.getState().loadQueue(release);

		fake = createFakeEngine();

		const second = configured();

		second.getState().hydrateQueue();
		second.getState().playTrack([makeItem('d')], 'd');

		const ids = second.getState().queue.map((item) => item.queueId);

		expect(new Set(ids).size).toBe(ids.length);

		localStorage.removeItem('player:v2:queue');
	});

	test('ignores a stored entry whose index falls outside the queue', () => {
		localStorage.setItem(
			'player:v2:queue',
			JSON.stringify({
				currentIndex: 9,
				currentTimeSeconds: 42,
				isShuffling: false,
				queue: release,
			}),
		);

		const store = configured();

		store.getState().hydrateQueue();

		expect(store.getState().queue).toHaveLength(3);
		expect(store.getState().currentIndex).toBeUndefined();
		expect(store.getState().currentTimeSeconds).toBe(0);

		localStorage.removeItem('player:v2:queue');
	});

	test('keeps what a page queued before the restore ran', () => {
		const first = configured();

		first.getState().hydrateQueue();
		first.getState().loadQueue(release);

		fake = createFakeEngine();

		const second = configured();

		second.getState().loadQueue([makeItem('x')]);
		second.getState().hydrateQueue();

		expect(second.getState().queue).toHaveLength(1);

		localStorage.removeItem('player:v2:queue');
	});
});

describe('storage', () => {
	test('survives a browser where reaching for localStorage throws', () => {
		const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');

		Object.defineProperty(globalThis, 'localStorage', {
			configurable: true,
			get() {
				throw new Error('SecurityError');
			},
		});

		try {
			const store = configured();

			expect(() => {
				store.getState().hydratePreferences();
			}).not.toThrow();
			expect(() => {
				store.getState().setVolume(0.3);
			}).not.toThrow();
			expect(() => {
				store.getState().toggleTimeMode();
			}).not.toThrow();
			expect(store.getState().volume).toBe(0.3);
		} finally {
			if (descriptor) Object.defineProperty(globalThis, 'localStorage', descriptor);
		}
	});

	test('a store that does not persist neither reads nor writes storage', () => {
		vi.useFakeTimers();
		localStorage.setItem('player:v1:volume', '0.4');
		localStorage.setItem(
			'player:v2:queue',
			JSON.stringify({
				currentIndex: 0,
				currentTimeSeconds: 42,
				isShuffling: false,
				queue: release,
			}),
		);

		const setItem = vi.spyOn(localStorage, 'setItem');

		try {
			const store = createPlayerStore({ createEngine: fake.createEngine, isPersistent: false });

			store.getState().hydratePreferences();
			store.getState().hydrateQueue();

			expect(store.getState().volume).toBe(1);
			expect(store.getState().queue).toHaveLength(0);

			store.getState().setVolume(0.7);
			store.getState().loadQueue([makeItem('x')]);
			vi.runAllTimers();

			expect(setItem).not.toHaveBeenCalled();
		} finally {
			setItem.mockRestore();
			vi.useRealTimers();
			localStorage.removeItem('player:v1:volume');
			localStorage.removeItem('player:v2:queue');
		}
	});

	test('writes the volume once for a run of changes', () => {
		vi.useFakeTimers();
		localStorage.removeItem('player:v1:volume');

		try {
			const store = configured();
			const setItem = vi.spyOn(localStorage, 'setItem');

			for (const volume of [0.1, 0.2, 0.3, 0.4]) store.getState().setVolume(volume);

			expect(setItem).not.toHaveBeenCalled();

			vi.runAllTimers();
			expect(setItem).toHaveBeenCalledTimes(1);
			expect(localStorage.getItem('player:v1:volume')).toBe('0.4');

			setItem.mockRestore();
		} finally {
			vi.useRealTimers();
			localStorage.removeItem('player:v1:volume');
		}
	});
});

describe('configure', () => {
	test('ignores a repeat of the resolvers it already holds', () => {
		const store = createPlayerStore({ createEngine: fake.createEngine });
		const urls: PlayerUrls = {
			stream: () => Promise.resolve<StreamResolution>({ status: 'ok', url: 'https://api.test/a' }),
		};

		store.getState().configure({ urls });

		const first = store.getState();

		store.getState().configure({ urls });
		expect(store.getState()).toBe(first);
	});
});
