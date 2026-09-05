import type { StoreApi } from 'zustand/vanilla';

import { beforeEach, describe, expect, test, vi } from 'vitest';

import type { AudioEngineCallbacks } from '#engine/audio-engine.ts';
import type { PlayerUrls, QueueItem, StreamResolution } from '#types.ts';

// The engine is mocked behind its module seam; the fake drives currentTime and captures callbacks
const engineMock = vi.hoisted(() => {
	let time = 0;
	const captured: { callbacks: AudioEngineCallbacks | undefined } = { callbacks: undefined };

	return {
		captured,
		engine: {
			analyser: vi.fn(),
			currentTime: vi.fn(() => time),
			load: vi.fn(() => Promise.resolve()),
			pause: vi.fn(),
			play: vi.fn(() => Promise.resolve()),
			prepare: vi.fn(),
			reset: vi.fn(() => {
				time = 0;
			}),
			seek: vi.fn((seconds: number) => {
				time = seconds;
			}),
			setVolume: vi.fn(),
		},
		setTime: (seconds: number) => {
			time = seconds;
		},
	};
});

vi.mock('#engine/audio-engine.ts', () => ({
	createAudioEngine: (callbacks: AudioEngineCallbacks) => {
		engineMock.captured.callbacks = callbacks;
		return engineMock.engine;
	},
}));

import type { PlayerStore } from '#store/player-store.ts';

import { createPlayerStore } from '#store/player-store.ts';

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

function configured(): StoreApi<PlayerStore> {
	return withResolver((trackId) =>
		Promise.resolve({ status: 'ok', url: `https://api.test/tracks/${trackId}/stream` }),
	);
}

function withResolver(stream: PlayerUrls['stream']): StoreApi<PlayerStore> {
	const store = createPlayerStore();

	store.getState().configure({
		urls: {
			stream,
			waveform: () => Promise.resolve(undefined),
		},
	});

	return store;
}

beforeEach(() => {
	vi.clearAllMocks();
	engineMock.setTime(0);
});

describe('playTrack', () => {
	test('loads the whole release and starts at the clicked track when the queue is empty', async () => {
		const store = configured();

		store.getState().playTrack(release, 'b');

		const state = store.getState();

		expect(state.queue).toHaveLength(3);
		expect(state.currentIndex).toBe(1);

		await vi.waitFor(() => {
			expect(engineMock.engine.load).toHaveBeenCalledWith(
				'https://api.test/tracks/b/stream',
				1,
				true,
			);
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
		store.setState({ status: 'playing' });
		store.getState().playTrack(release, 'a');

		expect(store.getState().queue).toHaveLength(3);
		expect(store.getState().currentIndex).toBe(0);
		expect(engineMock.engine.pause).toHaveBeenCalled();
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

describe('loadQueue', () => {
	test('puts a queue back without playing any of it', () => {
		const store = configured();

		store.getState().loadQueue(release);

		const state = store.getState();

		expect(state.queue).toHaveLength(3);
		expect(state.playOrder).toStrictEqual([0, 1, 2]);
		expect(state.currentIndex).toBeUndefined();
		expect(state.status).toBe('idle');
		expect(engineMock.engine.load).not.toHaveBeenCalled();
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
		engineMock.setTime(5);
		store.getState().previous();

		expect(store.getState().currentIndex).toBe(1);
		expect(engineMock.engine.seek).toHaveBeenCalledWith(0);
	});

	test('steps back within the opening seconds', () => {
		const store = configured();

		store.getState().playTrack(release, 'b');
		engineMock.setTime(1);
		store.getState().previous();

		expect(store.getState().currentIndex).toBe(0);
	});

	test('restarts at the head of the queue', () => {
		const store = configured();

		store.getState().playTrack(release, 'a');
		engineMock.setTime(1);
		store.getState().previous();

		expect(store.getState().currentIndex).toBe(0);
		expect(engineMock.engine.seek).toHaveBeenCalledWith(0);
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

		engineMock.setTime(1);
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
		expect(engineMock.engine.reset).toHaveBeenCalled();
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
		expect(engineMock.engine.reset).toHaveBeenCalled();
	});

	test('drops a resolve in flight when the loaded track is removed', async () => {
		const { promise, resolve } = Promise.withResolvers<StreamResolution>();
		const store = withResolver(() => promise);

		store.getState().playTrack(release, 'a');
		store.getState().removeAt(0);
		resolve({ status: 'ok', url: 'https://api.test/tracks/a/stream' });
		await Promise.resolve();

		expect(engineMock.engine.load).not.toHaveBeenCalled();
	});
});

describe('transport', () => {
	test('pauses the engine when toggled while playing', () => {
		const store = configured();

		store.getState().playTrack(release, 'a');
		store.setState({ status: 'playing' });
		store.getState().togglePlay();

		expect(engineMock.engine.pause).toHaveBeenCalled();
	});

	test('resumes the engine when toggled while paused', () => {
		const store = configured();

		store.getState().playTrack(release, 'a');
		store.setState({ status: 'paused' });
		store.getState().togglePlay();

		expect(engineMock.engine.play).toHaveBeenCalled();
	});

	test('starts the first play-order track when nothing is loaded', () => {
		const store = configured();

		store.getState().playTrack(release, 'a');
		store.getState().removeAt(0);
		expect(store.getState().currentIndex).toBeUndefined();

		store.getState().togglePlay();
		expect(store.getState().currentIndex).toBe(0);
	});

	test('seeks the engine and updates the position', () => {
		const store = configured();

		store.getState().playTrack(release, 'a');
		store.getState().seek(42);

		expect(engineMock.engine.seek).toHaveBeenCalledWith(42);
		expect(store.getState().currentTimeS).toBe(42);
	});

	test('stops playback and resets the engine', () => {
		const store = configured();

		store.getState().playTrack(release, 'a');
		store.setState({ currentTimeS: 30, status: 'playing' });
		store.getState().stop();

		expect(engineMock.engine.reset).toHaveBeenCalled();
		expect(store.getState().status).toBe('idle');
		expect(store.getState().currentTimeS).toBe(0);
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
		const store = withResolver((trackId) => {
			resolved.push(trackId);
			return Promise.resolve({
				status: 'ok',
				url: `https://api.test/tracks/${trackId}/${String(resolved.length)}`,
			});
		});

		store.getState().playTrack(release, 'a');
		await vi.waitFor(() => {
			expect(engineMock.engine.load).toHaveBeenCalledTimes(1);
		});

		engineMock.captured.callbacks?.onError('network');
		await vi.waitFor(() => {
			expect(engineMock.engine.load).toHaveBeenCalledTimes(2);
		});
		expect(resolved).toStrictEqual(['a', 'a']);
		expect(store.getState().status).not.toBe('error');

		engineMock.captured.callbacks?.onError('network');
		expect(store.getState().status).toBe('error');
		expect(store.getState().playbackError).toStrictEqual({ stage: 'network', trackId: 'a' });
	});

	test('stops at a capped resolve without loading or re-resolving', async () => {
		const resolved: Array<string> = [];
		const store = withResolver((trackId) => {
			resolved.push(trackId);
			return Promise.resolve({ status: 'capped' });
		});

		store.getState().playTrack(release, 'a');
		await vi.waitFor(() => {
			expect(store.getState().status).toBe('capped');
		});

		expect(engineMock.engine.load).not.toHaveBeenCalled();
		expect(resolved).toStrictEqual(['a']);
	});

	test('drops a resolve that lands after the listener moved on', async () => {
		const pending = new Map<string, (resolution: StreamResolution) => void>();
		const store = withResolver(
			(trackId) =>
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
			expect(engineMock.engine.load).toHaveBeenCalledTimes(1);
		});
		expect(engineMock.engine.load).toHaveBeenCalledWith('https://api.test/b', 1, true);
	});

	test('enters the error state when the resolve itself never answers', async () => {
		const store = withResolver(() => Promise.reject(new Error('no route')));

		store.getState().playTrack(release, 'a');
		await vi.waitFor(() => {
			expect(store.getState().status).toBe('error');
		});

		expect(engineMock.engine.load).not.toHaveBeenCalled();
	});
});

describe('volume', () => {
	test('clamps to the 0..1 range', () => {
		const store = configured();

		store.getState().setVolume(1.5);
		expect(store.getState().volume).toBe(1);

		store.getState().setVolume(-0.2);
		expect(store.getState().volume).toBe(0);
	});

	test('restores a stored volume on configure', () => {
		localStorage.setItem('player:volume', '0.4');

		expect(configured().getState().volume).toBe(0.4);

		localStorage.removeItem('player:volume');
	});
});
