import type { StoreApi } from 'zustand/vanilla';

import { beforeEach, describe, expect, test, vi } from 'vitest';

import type { PlayerStore } from '#store/player-store.ts';
import type { PlayerUrls, QueueItem, StreamResolution } from '#types.ts';

import { createMockEngine } from '#engine/audio-engine-mock.ts';
import { createPlayerStore } from '#store/player-store.ts';

// Replaced per test, so nothing a store did survives into the next one
let fake = createMockEngine();

function makeItem(id: string): QueueItem {
	return {
		artistLine: 'Nebula Drift',
		durationMs: 180_000,
		itemId: id,
		releaseHref: '/releases/cosmic-drift',
		releaseTitle: 'Cosmic Drift',
		title: `Track ${id}`,
	};
}

const release = [makeItem('a'), makeItem('b'), makeItem('c')];

const mediaSnapshot = { networkState: 2, positionSeconds: 0, readyState: 0 };

interface StoredQueueRecord {
	currentIndex: number | undefined;
	currentTimeSeconds: number;
	isShuffling: boolean;
	playOrder: Array<number>;
	queue: Array<{ itemId: string }>;
}

function configured(): StoreApi<PlayerStore> {
	return withResolver(({ itemId }) =>
		Promise.resolve({ status: 'ok', url: `https://api.test/tracks/${itemId}/stream` }),
	);
}

async function failIntoRetry(store: StoreApi<PlayerStore>): Promise<void> {
	store.getState().playTrack(release, 'a');
	await vi.waitFor(() => {
		expect(fake.engine.load).toHaveBeenCalledTimes(1);
	});

	fake.callbacks.current?.onError('network');
	await vi.waitFor(() => {
		expect(fake.engine.load).toHaveBeenCalledTimes(2);
	});
}

function hidePage(): void {
	const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');

	document.dispatchEvent(new Event('visibilitychange'));
	visibility.mockRestore();
}

// The position drifting between queue changes goes out on `pagehide`
function leavePage(): void {
	window.dispatchEvent(new Event('pagehide'));
}

function pendingResolver() {
	const pending = new Map<string, (resolution: StreamResolution) => void>();
	const store = withResolver(
		({ itemId }) =>
			new Promise<StreamResolution>((resolve) => {
				pending.set(itemId, resolve);
			}),
	);

	return {
		answer: (itemId: string) => {
			pending.get(itemId)?.({ status: 'ok', url: `https://api.test/${itemId}` });
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
	fake = createMockEngine();
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
				resumeAtSeconds: 0,
				src: 'https://api.test/tracks/b/stream',
			});
		});
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

describe('playQueue', () => {
	test('replaces a running queue and plays the new one from the top', () => {
		const store = configured();

		store.getState().playTrack(release, 'b');
		store.getState().playQueue([makeItem('x'), makeItem('y')]);

		const state = store.getState();

		expect(state.queue.map((item) => item.itemId)).toStrictEqual(['x', 'y']);
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
		expect(state.queue[1]?.itemId).toBe('c');
		expect(state.currentIndex).toBeUndefined();
		expect(state.status).toBe('idle');
		expect(fake.engine.load).not.toHaveBeenCalled();
	});
});

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
		store.getState().loadQueue([makeItem('x')]);

		expect(fake.engine.reset).toHaveBeenCalled();
		expect(store.getState()).toMatchObject({
			currentIndex: undefined,
			isPaused: true,
			status: 'idle',
		});
	});

	test('gives every enqueued item an id, including a second copy of the same track', () => {
		const store = configured();

		store.getState().loadQueue([...release, ...release]);

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

describe('engine errors', () => {
	test('re-resolves once on a failure, then reports the second as an error', async () => {
		const resolved: Array<string> = [];
		const store = withResolver(({ itemId }) => {
			resolved.push(itemId);
			return Promise.resolve({
				status: 'ok',
				url: `https://api.test/tracks/${itemId}/${String(resolved.length)}`,
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
		expect(store.getState().playbackError).toStrictEqual({ itemId: 'a', stage: 'network' });
	});

	test('re-resolves again after a failure that follows playback', async () => {
		const resolved: Array<string> = [];
		const store = withResolver(({ itemId }) => {
			resolved.push(itemId);
			return Promise.resolve({
				status: 'ok',
				url: `https://api.test/tracks/${itemId}/${String(resolved.length)}`,
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

		// Reaching playback closes the chain the one re-resolve was spent on
		fake.callbacks.current?.onStatus('playing');
		fake.callbacks.current?.onError('network');

		await vi.waitFor(() => {
			expect(fake.engine.load).toHaveBeenCalledTimes(3);
		});
		expect(resolved).toStrictEqual(['a', 'a', 'a']);
		expect(store.getState().status).not.toBe('error');
	});

	test('stops at a capped resolve without loading or re-resolving', async () => {
		const resolved: Array<string> = [];
		const store = withResolver(({ itemId }) => {
			resolved.push(itemId);
			return Promise.resolve({ status: 'capped' });
		});

		store.getState().playTrack(release, 'a');
		await vi.waitFor(() => {
			expect(store.getState().status).toBe('capped');
		});

		expect(fake.engine.load).not.toHaveBeenCalled();
		expect(resolved).toStrictEqual(['a']);
	});

	test('loads a type the probe declined, and plays it when the probe was wrong', async () => {
		const store = withResolver(({ itemId }) =>
			Promise.resolve({
				status: 'ok',
				type: 'audio/mp4; codecs="Opus"',
				url: `https://api.test/tracks/${itemId}/stream`,
			}),
		);
		fake.engine.canPlay.mockReturnValue(false);

		store.getState().playTrack(release, 'a');
		await vi.waitFor(() => {
			expect(fake.engine.load).toHaveBeenCalledTimes(1);
		});
		fake.callbacks.current?.onStatus('playing');

		expect(fake.engine.canPlay).toHaveBeenCalledWith('audio/mp4; codecs="Opus"');
		expect(store.getState().status).toBe('playing');
	});

	test('an unsupported failure on a declined type is unplayable, without a re-resolve', async () => {
		const resolved: Array<string> = [];
		const store = withResolver(({ itemId }) => {
			resolved.push(itemId);
			return Promise.resolve({
				status: 'ok',
				type: 'audio/x-unplayable',
				url: `https://api.test/tracks/${itemId}/stream`,
			});
		});
		fake.engine.canPlay.mockReturnValue(false);

		store.getState().playTrack(release, 'a');
		await vi.waitFor(() => {
			expect(fake.engine.load).toHaveBeenCalledTimes(1);
		});
		fake.callbacks.current?.onError('unsupported');

		expect(store.getState().status).toBe('unplayable');
		expect(store.getState().isPaused).toBe(true);
		expect(resolved).toStrictEqual(['a']);
	});

	test('an unsupported failure on a type the probe accepted still earns its re-resolve', async () => {
		const store = withResolver(({ itemId }) =>
			Promise.resolve({
				status: 'ok',
				type: 'audio/mp4; codecs="Opus"',
				url: `https://api.test/tracks/${itemId}/stream`,
			}),
		);

		store.getState().playTrack(release, 'a');
		await vi.waitFor(() => {
			expect(fake.engine.load).toHaveBeenCalledTimes(1);
		});
		fake.callbacks.current?.onError('unsupported');

		await vi.waitFor(() => {
			expect(fake.engine.load).toHaveBeenCalledTimes(2);
		});
		expect(store.getState().status).not.toBe('unplayable');
	});

	test('drops a resolve that lands after the listener moved on', async () => {
		const pending = new Map<string, (resolution: StreamResolution) => void>();
		const store = withResolver(
			({ itemId }) =>
				new Promise<StreamResolution>((resolve) => {
					pending.set(itemId, resolve);
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

describe('diagnostics', () => {
	test('stamps each report with the loaded item and whether its attempt is the re-resolve', () => {
		const store = configured();

		store.getState().playTrack(release, 'a');
		fake.callbacks.current?.onDiagnostic?.({
			...mediaSnapshot,
			kind: 'media-error',
			message: 'gone',
		});
		expect(store.getState().diagnostic).toMatchObject({ isRetry: false, itemId: 'a' });

		fake.callbacks.current?.onError('network');
		fake.callbacks.current?.onDiagnostic?.({
			...mediaSnapshot,
			bufferedAheadSeconds: 0,
			hasPlayed: false,
			kind: 'stall',
		});
		expect(store.getState().diagnostic).toMatchObject({
			isRetry: true,
			itemId: 'a',
			kind: 'stall',
		});
	});

	test('a re-resolve that reaches playback reports the failure it recovered from', async () => {
		const store = configured();

		await failIntoRetry(store);
		fake.callbacks.current?.onStatus('playing');

		expect(store.getState().diagnostic).toMatchObject({
			isRetry: true,
			kind: 'retry-recovered',
			stage: 'network',
		});

		// Playing again later is not a second recovery
		const recovered = store.getState().diagnostic;

		fake.callbacks.current?.onStatus('paused');
		fake.callbacks.current?.onStatus('playing');
		expect(store.getState().diagnostic).toBe(recovered);
	});

	test('a re-resolve that fails as well reports no recovery', async () => {
		const store = configured();

		await failIntoRetry(store);
		fake.callbacks.current?.onError('network');

		expect(store.getState().status).toBe('error');
		expect(store.getState().diagnostic).toBeUndefined();
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
			const store = withResolver(({ itemId }) => {
				resolved.push(itemId);
				return Promise.resolve(resolution);
			});
			fake.engine.canPlay.mockReturnValue(false);
			fake.engine.load.mockImplementation(() => {
				fake.callbacks.current?.onError('unsupported');
				return Promise.resolve();
			});

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

	test('mutes through the engine without touching the level it holds', () => {
		const store = configured();

		store.getState().playTrack(release, 'a');
		store.getState().setVolume(0.7);

		store.getState().toggleMuted();
		expect(store.getState()).toMatchObject({ isMuted: true, volume: 0.7 });
		expect(fake.engine.setMuted).toHaveBeenLastCalledWith(true);
		expect(fake.engine.setVolume).toHaveBeenLastCalledWith(0.7);

		store.getState().toggleMuted();
		expect(store.getState()).toMatchObject({ isMuted: false, volume: 0.7 });
		expect(fake.engine.setMuted).toHaveBeenLastCalledWith(false);
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

describe('panel state', () => {
	test('persists the open state and restores it on hydrate', () => {
		configured().getState().togglePanel();

		expect(localStorage.getItem('player:v1:panel-open')).toBe('true');

		const restored = configured();

		restored.getState().hydratePreferences();
		expect(restored.getState().isPanelOpen).toBe(true);

		localStorage.removeItem('player:v1:panel-open');
	});

	test('persists the zoom step and restores it on hydrate', () => {
		configured().getState().zoomPanel(1);

		expect(localStorage.getItem('player:v1:panel-zoom')).toBe('105');

		const restored = configured();

		restored.getState().hydratePreferences();
		expect(restored.getState().panelPxPerSecond).toBe(105);

		localStorage.removeItem('player:v1:panel-zoom');
	});

	test('ignores a stored zoom that is not a step on the ladder', () => {
		localStorage.setItem('player:v1:panel-zoom', '83');

		const store = configured();

		store.getState().hydratePreferences();
		expect(store.getState().panelPxPerSecond).toBe(70);

		localStorage.removeItem('player:v1:panel-zoom');
	});
});

describe('scrub preview', () => {
	test('writes once per whole second a held finger crosses', () => {
		const store = configured();
		const written: Array<number | undefined> = [];

		store.subscribe((state) => {
			written.push(state.scrubPreviewSeconds);
		});
		for (const seconds of [65.2, 65.9, 66.1, undefined, undefined]) {
			store.getState().setScrubPreview(seconds);
		}

		expect(written).toStrictEqual([65, 66, undefined]);
	});
});

describe('queue persistence', () => {
	test('writes the queue as it changes, and clears it when the queue empties', () => {
		const store = configured();

		store.getState().hydrateQueue();
		store.getState().playTrack(release, 'b');

		expect(storedQueue()?.queue.map((item) => item.itemId)).toStrictEqual(['a', 'b', 'c']);
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

		fake = createMockEngine();

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

		fake = createMockEngine();

		const second = configured();

		second.getState().hydrateQueue();

		const state = second.getState();

		expect(state.queue.map((item) => item.itemId)).toStrictEqual(['a', 'b', 'c']);
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

		fake = createMockEngine();

		const second = configured();

		second.getState().hydrateQueue();
		second.getState().togglePaused();

		await vi.waitFor(() => {
			expect(fake.engine.load).toHaveBeenCalledWith({
				resumeAtSeconds: 42,
				src: 'https://api.test/tracks/b/stream',
			});
		});

		localStorage.removeItem('player:v2:queue');
	});

	test('restarts a restored track past the threshold rather than stepping back', () => {
		const first = configured();

		first.getState().hydrateQueue();
		first.getState().playTrack(release, 'b');
		first.getState().seek(42);
		leavePage();

		fake = createMockEngine();

		const second = configured();

		second.getState().hydrateQueue();
		second.getState().previous();

		expect(second.getState().currentIndex).toBe(1);
		expect(second.getState().currentTimeSeconds).toBe(0);
		expect(fake.engine.load).not.toHaveBeenCalled();

		localStorage.removeItem('player:v2:queue');
	});

	test('stamps a restored queue with fresh ids rather than the ones it was stored with', () => {
		const first = configured();

		first.getState().hydrateQueue();
		first.getState().loadQueue(release);

		fake = createMockEngine();

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

		fake = createMockEngine();

		const second = configured();

		second.getState().loadQueue([makeItem('x')]);
		second.getState().hydrateQueue();

		expect(second.getState().queue).toHaveLength(1);

		localStorage.removeItem('player:v2:queue');
	});

	// Earlier stores in this file still listen, so a first flush settles whatever they hold unsaved
	test('leaves a queue another tab saved when a store that never moved unloads', () => {
		const first = configured();

		first.getState().hydrateQueue();
		first.getState().loadQueue(release);

		fake = createMockEngine();

		const second = configured();

		second.getState().hydrateQueue();
		leavePage();
		localStorage.setItem('player:v2:queue', JSON.stringify({ queue: [makeItem('y')] }));
		leavePage();

		expect(storedQueue()?.queue.map((item) => item.itemId)).toStrictEqual(['y']);

		second.getState().seek(30);
		leavePage();

		expect(storedQueue()?.currentTimeSeconds).toBe(30);

		localStorage.removeItem('player:v2:queue');
	});

	test('flushes the position when the page goes hidden', () => {
		const store = configured();

		store.getState().hydrateQueue();
		store.getState().playTrack(release, 'b');
		store.getState().seek(42);
		hidePage();

		expect(storedQueue()?.currentTimeSeconds).toBe(42);

		localStorage.removeItem('player:v2:queue');
	});

	test('writes a shuffle toggle straight away, and a reload keeps its order', () => {
		const random = vi.spyOn(Math, 'random').mockReturnValue(0);
		const first = configured();

		first.getState().hydrateQueue();
		first.getState().loadQueue([...release, makeItem('d')]);
		first.getState().toggleShuffle();

		const { playOrder } = first.getState();

		expect(storedQueue()).toMatchObject({ isShuffling: true, playOrder });

		random.mockReturnValue(0.99);
		fake = createMockEngine();

		const second = configured();

		second.getState().hydrateQueue();

		expect(second.getState().playOrder).toStrictEqual(playOrder);

		random.mockRestore();
		localStorage.removeItem('player:v2:queue');
	});

	test('reshuffles a stored order that is not a permutation of the queue', () => {
		localStorage.setItem(
			'player:v2:queue',
			JSON.stringify({ isShuffling: true, playOrder: [0, 0, 1], queue: release }),
		);

		const store = configured();

		store.getState().hydrateQueue();

		expect(store.getState().playOrder.toSorted((left, right) => left - right)).toStrictEqual([
			0, 1, 2,
		]);

		localStorage.removeItem('player:v2:queue');
	});

	test('drops a malformed stored item and follows the loaded one past it', () => {
		localStorage.setItem(
			'player:v2:queue',
			JSON.stringify({
				currentIndex: 2,
				currentTimeSeconds: 42,
				queue: [makeItem('a'), { itemId: 5 }, makeItem('c')],
			}),
		);

		const store = configured();

		store.getState().hydrateQueue();

		expect(store.getState().queue.map((item) => item.itemId)).toStrictEqual(['a', 'c']);
		expect(store.getState()).toMatchObject({ currentIndex: 1, currentTimeSeconds: 42 });

		localStorage.removeItem('player:v2:queue');
	});

	test('ignores a stored index that is not a whole number', () => {
		localStorage.setItem(
			'player:v2:queue',
			JSON.stringify({ currentIndex: 1.5, currentTimeSeconds: 42, queue: release }),
		);

		const store = configured();

		store.getState().hydrateQueue();

		expect(store.getState()).toMatchObject({ currentIndex: undefined, currentTimeSeconds: 0 });

		localStorage.removeItem('player:v2:queue');
	});

	test('restores a stored entry that carries no shuffle flag', () => {
		localStorage.setItem(
			'player:v2:queue',
			JSON.stringify({ currentIndex: 0, currentTimeSeconds: 0, queue: release }),
		);

		const store = configured();

		store.getState().hydrateQueue();

		expect(store.getState().isShuffling).toBe(false);

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

	test('flushes a pending volume when the page goes hidden', () => {
		vi.useFakeTimers();
		localStorage.removeItem('player:v1:volume');

		try {
			configured().getState().setVolume(0.3);
			hidePage();

			expect(localStorage.getItem('player:v1:volume')).toBe('0.3');
		} finally {
			vi.useRealTimers();
			localStorage.removeItem('player:v1:volume');
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
