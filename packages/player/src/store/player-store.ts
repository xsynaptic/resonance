import type { StoreApi } from 'zustand/vanilla';

import { createStore } from 'zustand/vanilla';

import type { AudioEngine } from '#engine/audio-engine.ts';
import type {
	PlaybackError,
	PlaybackErrorStage,
	PlayerStatus,
	PlayerTimeMode,
	PlayerUrls,
	QueueItem,
} from '#types.ts';

import { createAudioEngine } from '#engine/audio-engine.ts';
import {
	bindMediaSession,
	clearMediaMetadata,
	setMediaMetadata,
	setMediaPlaybackState,
} from '#engine/media-session.ts';
import { normalizationGain } from '#engine/playback-gain.ts';
import {
	identityOrder,
	isSectioned,
	nextInOrder,
	previousInOrder,
	shuffledOrder,
} from '#queue/queue.ts';

// Past this many seconds into a track, previous restarts it instead of stepping back
const restartThresholdSeconds = 3;
const timeModeStorageKey = 'player:v1:time-mode';
const volumeStorageKey = 'player:v1:volume';

const volumeWriteDelayMs = 250;

export type PlayerStore = PlayerActions & PlayerState;

// One trip through resolve-then-load, so a late answer can be recognized as stale
interface LoadAttempt {
	autoplay: boolean;
	index: number;
	isRetry: boolean;
}

// Property syntax so a component can select one action without tripping `unbound-method`
interface PlayerActions {
	clearQueue: () => void;
	// Accepts the host's resolvers and nothing else; a host passing an inline object re-runs it on every render
	configure: (config: { urls: PlayerUrls | undefined }) => void;
	// Read inside a rAF loop, never as a render input
	getAnalyser: () => AnalyserNode | undefined;
	// Reads the listener's persisted preferences; separate from `configure` so a re-render cannot re-run it
	hydratePreferences: () => void;
	// Replaces the queue without touching the engine; nothing plays until a gesture asks
	loadQueue: (items: ReadonlyArray<QueueItem>) => void;
	next: () => void;
	playAt: (index: number) => void;
	// Empty queue plays from the top; a running queue appends every track and jumps to the first appended
	playRelease: (releaseItems: ReadonlyArray<QueueItem>) => void;
	// Empty queue loads the whole release at the clicked track; a running queue appends that track and jumps to it
	playTrack: (releaseItems: ReadonlyArray<QueueItem>, trackId: string) => void;
	previous: () => void;
	removeAt: (index: number) => void;
	// Swaps out everything after `index`, leaving the loaded track and what came before it alone
	replaceAfter: (index: number, items: ReadonlyArray<QueueItem>) => void;
	seek: (seconds: number) => void;
	// Clamped into the loaded track, so the skip buttons and the lock screen cannot run past either end
	seekBy: (deltaSeconds: number) => void;
	setVolume: (volume: number) => void;
	stop: () => void;
	// Drops to silence and back to the level held when muting; a manual drag to zero unmutes to full
	toggleMute: () => void;
	togglePlay: () => void;
	toggleShuffle: () => void;
	toggleTimeMode: () => void;
	toggleTray: () => void;
}

interface PlayerState {
	// Index into `queue`, not `playOrder`
	currentIndex: number | undefined;
	currentTimeS: number;
	durationS: number | undefined;
	isShuffling: boolean;
	isTrayOpen: boolean;
	// The last terminal failure, cleared as a new load starts
	playbackError: PlaybackError | undefined;
	// A permutation of queue indices; reshuffled when shuffle toggles or items are appended
	playOrder: Array<number>;
	queue: Array<QueueItem>;
	status: PlayerStatus;
	// A listener preference rather than playback state, so it is persisted beside the volume
	timeMode: PlayerTimeMode;
	// `undefined` renders the player inert
	urls: PlayerUrls | undefined;
	volume: number;
}

const initialPlayerState: PlayerState = {
	currentIndex: undefined,
	currentTimeS: 0,
	durationS: undefined,
	isShuffling: false,
	isTrayOpen: false,
	playbackError: undefined,
	playOrder: [],
	queue: [],
	status: 'idle',
	timeMode: 'elapsed',
	urls: undefined,
	volume: 1,
};

export function createPlayerStore(): StoreApi<PlayerStore> {
	return createStore<PlayerStore>()((set, get) => {
		// Created on the first action that needs it, inside a user gesture and on the client
		let engine: AudioEngine | undefined;
		let loading: LoadAttempt | undefined;
		let volumeBeforeMute: number | undefined;

		// Per store rather than per module, so a second store never inherits a pending write
		let isFlushBound = false;
		let volumeWriteTimer: ReturnType<typeof setTimeout> | undefined;
		let volumeToWrite: number | undefined;

		function flushVolume(): void {
			if (volumeWriteTimer !== undefined) clearTimeout(volumeWriteTimer);

			volumeWriteTimer = undefined;

			if (volumeToWrite === undefined) return;

			writeStored(volumeStorageKey, String(volumeToWrite));
			volumeToWrite = undefined;
		}

		function persistVolume(volume: number): void {
			volumeToWrite = volume;

			if (!isFlushBound) {
				isFlushBound = true;
				// The tab can close inside the delay, so a pending write goes out on the way
				window.addEventListener('pagehide', flushVolume);
			}

			if (volumeWriteTimer !== undefined) return;

			volumeWriteTimer = setTimeout(flushVolume, volumeWriteDelayMs);
		}

		function ensureEngine(): AudioEngine {
			if (engine) return engine;

			engine = createAudioEngine({
				onDuration: (durationS) => {
					set({ durationS });
				},
				onEnded: () => {
					advance();
				},
				// A resolved URL can go stale while the page sits open, so one failure earns one re-resolve
				onError: (stage) => {
					if (loading && !loading.isRetry) {
						loadIndex(loading.index, loading.autoplay, true);
						return;
					}

					fail(stage);
				},
				onStatus: (status) => {
					set({ status });
					if (status !== 'loading') setMediaPlaybackState(status);
				},
				onTime: (currentTimeS) => {
					set({ currentTimeS });
				},
			});
			engine.setVolume(get().volume);
			bindMediaSession({
				next: () => {
					get().next();
				},
				pause: () => engine?.pause(),
				play: () => {
					get().togglePlay();
				},
				previous: () => {
					get().previous();
				},
				seekBy: (deltaSeconds) => {
					get().seekBy(deltaSeconds);
				},
				seekTo: (seconds) => {
					get().seek(seconds);
				},
			});

			return engine;
		}

		// The element and the play promise can both report one failure; clearing the attempt makes the second a no-op
		function fail(stage: PlaybackErrorStage): void {
			if (loading === undefined) return;

			loading = undefined;

			const { currentIndex, queue } = get();
			const trackId = currentIndex === undefined ? undefined : queue[currentIndex]?.trackId;

			set({
				playbackError: trackId === undefined ? undefined : { stage, trackId },
				status: 'error',
			});
			setMediaPlaybackState('paused');
		}

		function loadIndex(index: number, shouldAutoplay: boolean, isRetry = false): void {
			const state = get();
			const item = state.queue[index];
			if (!item || state.urls === undefined) return;

			set({
				currentIndex: index,
				currentTimeS: 0,
				durationS: item.durationMs === undefined ? undefined : item.durationMs / 1000,
				playbackError: undefined,
				status: 'loading',
			});
			setMediaMetadata(item);

			const gain = normalizationGain(item, state.isShuffling);

			// Before the await: autoplay policy admits the graph only while still inside the gesture
			const activeEngine = ensureEngine();
			if (shouldAutoplay) activeEngine.prepare();

			const attempt: LoadAttempt = { autoplay: shouldAutoplay, index, isRetry };

			loading = attempt;

			void state.urls
				.stream(item.trackId)
				.then(async (resolution) => {
					if (loading !== attempt) return;

					// Not retried: a re-resolve would answer the same
					if (resolution.status === 'capped') {
						set({ status: 'capped' });
						setMediaPlaybackState('paused');
						return;
					}

					await activeEngine.load(resolution.url, gain, shouldAutoplay);
				})
				.catch(() => {
					if (loading !== attempt) return;

					fail('resolve');
				});
		}

		// At the end of the play order, stop without wrapping
		function advance(): void {
			const { currentIndex, playOrder } = get();
			if (currentIndex === undefined) return;

			const upcoming = nextInOrder(playOrder, currentIndex);
			if (upcoming === undefined) {
				get().stop();
				return;
			}

			loadIndex(upcoming, true);
		}

		function applyVolume(volume: number): void {
			const clamped = clampVolume(volume);

			set({ volume: clamped });
			persistVolume(clamped);
			engine?.setVolume(clamped);
		}

		// Whatever resolve is in flight answers into nothing rather than reloading what was dropped
		function unload(): void {
			engine?.reset();
			loading = undefined;
			clearMediaMetadata();
			setMediaPlaybackState('none');
		}

		return {
			...initialPlayerState,

			clearQueue: () => {
				unload();
				set({
					currentIndex: undefined,
					currentTimeS: 0,
					durationS: undefined,
					playOrder: [],
					queue: [],
					status: 'idle',
				});
			},

			configure: ({ urls }) => {
				if (get().urls === urls) return;

				set({ urls });
			},

			getAnalyser: () => engine?.analyser(),

			hydratePreferences: () => {
				const storedTimeMode = readStoredTimeMode();
				if (storedTimeMode !== undefined) set({ timeMode: storedTimeMode });

				const storedVolume = readStoredVolume();
				if (storedVolume === undefined) return;

				set({ volume: storedVolume });
				engine?.setVolume(storedVolume);
			},

			loadQueue: (items) => {
				if (items.length === 0) return;

				// A sectioned queue lands unshuffled whatever the listener left the toggle on
				const isShuffling = get().isShuffling && !isSectioned(items);

				set({
					currentIndex: undefined,
					currentTimeS: 0,
					durationS: undefined,
					isShuffling,
					playOrder: orderFor(items.length, undefined, isShuffling),
					queue: [...items],
					status: 'idle',
				});
			},

			next: () => {
				advance();
			},

			playAt: (index) => {
				if (index < 0 || index >= get().queue.length) return;

				loadIndex(index, true);
			},

			playRelease: (releaseItems) => {
				if (releaseItems.length === 0) return;

				const state = get();
				if (state.queue.length === 0) {
					set({
						playOrder: orderFor(releaseItems.length, 0, state.isShuffling),
						queue: [...releaseItems],
					});
					loadIndex(0, true);
					return;
				}

				const firstAppended = state.queue.length;
				const queue = [...state.queue, ...releaseItems];

				set({
					playOrder: orderFor(queue.length, firstAppended, state.isShuffling),
					queue,
				});
				loadIndex(firstAppended, true);
			},

			playTrack: (releaseItems, trackId) => {
				const state = get();
				if (state.queue.length === 0) {
					const startIndex = releaseItems.findIndex((item) => item.trackId === trackId);
					if (startIndex === -1) return;

					set({
						playOrder: orderFor(releaseItems.length, startIndex, state.isShuffling),
						queue: [...releaseItems],
					});
					loadIndex(startIndex, true);
					return;
				}

				// Already loaded is a transport toggle; already queued is a jump, not a second copy
				const queued = state.queue.findIndex((item) => item.trackId === trackId);
				if (queued === state.currentIndex) {
					get().togglePlay();
					return;
				}
				if (queued !== -1) {
					loadIndex(queued, true);
					return;
				}

				const found = releaseItems.find((item) => item.trackId === trackId);
				if (!found) return;

				const queue = [...state.queue, found];
				const appendedIndex = queue.length - 1;

				set({
					playOrder: orderFor(queue.length, appendedIndex, state.isShuffling),
					queue,
				});
				loadIndex(appendedIndex, true);
			},

			previous: () => {
				const { currentIndex, playOrder } = get();
				if (currentIndex === undefined) return;

				const activeEngine = ensureEngine();
				const back = previousInOrder(playOrder, currentIndex);

				if (back === undefined || activeEngine.currentTime() > restartThresholdSeconds) {
					activeEngine.seek(0);
					return;
				}

				loadIndex(back, true);
			},

			removeAt: (index) => {
				const state = get();
				if (index < 0 || index >= state.queue.length) return;

				const queue = state.queue.filter((_, position) => position !== index);

				if (index === state.currentIndex) {
					unload();
					set({
						currentIndex: undefined,
						currentTimeS: 0,
						durationS: undefined,
						playOrder: orderFor(queue.length, undefined, state.isShuffling),
						queue,
						status: 'idle',
					});
					return;
				}

				// Removing an earlier track shifts the loaded one down
				const currentIndex =
					state.currentIndex !== undefined && index < state.currentIndex
						? state.currentIndex - 1
						: state.currentIndex;

				set({
					currentIndex,
					playOrder: orderFor(queue.length, currentIndex, state.isShuffling),
					queue,
				});
			},

			replaceAfter: (index, items) => {
				const state = get();
				if (index < 0 || index >= state.queue.length) return;
				if (state.currentIndex !== undefined && state.currentIndex > index) return;

				const queue = [...state.queue.slice(0, index + 1), ...items];
				const isShuffling = state.isShuffling && !isSectioned(queue);

				set({
					isShuffling,
					playOrder: orderFor(queue.length, state.currentIndex, isShuffling),
					queue,
				});
			},

			seek: (seconds) => {
				ensureEngine().seek(seconds);
				set({ currentTimeS: seconds });
			},

			seekBy: (deltaSeconds) => {
				const { currentTimeS, durationS } = get();
				if (durationS === undefined) return;

				get().seek(Math.min(durationS, Math.max(0, currentTimeS + deltaSeconds)));
			},

			setVolume: (volume) => {
				applyVolume(volume);
			},

			stop: () => {
				unload();
				set({ currentTimeS: 0, status: 'idle' });
			},

			toggleMute: () => {
				const { volume } = get();
				if (volume > 0) {
					volumeBeforeMute = volume;
					applyVolume(0);
					return;
				}

				applyVolume(volumeBeforeMute ?? 1);
			},

			togglePlay: () => {
				const state = get();
				if (state.currentIndex === undefined) {
					const first = state.playOrder[0];
					if (first === undefined) return;

					loadIndex(first, true);
					return;
				}

				const activeEngine = ensureEngine();
				if (state.status === 'playing') {
					activeEngine.pause();
					return;
				}

				void activeEngine.play();
			},

			toggleShuffle: () => {
				const state = get();
				if (isSectioned(state.queue)) return;

				const isShuffling = !state.isShuffling;

				set({
					isShuffling,
					playOrder: orderFor(state.queue.length, state.currentIndex, isShuffling),
				});
			},

			toggleTimeMode: () => {
				const timeMode = get().timeMode === 'elapsed' ? 'remaining' : 'elapsed';

				set({ timeMode });
				writeStored(timeModeStorageKey, timeMode);
			},

			toggleTray: () => {
				set((state) => ({ isTrayOpen: !state.isTrayOpen }));
			},
		};
	});
}

function clampVolume(volume: number): number {
	return Math.min(1, Math.max(0, volume));
}

function orderFor(length: number, currentIndex: number | undefined, isShuffling: boolean) {
	return isShuffling ? shuffledOrder(length, currentIndex) : identityOrder(length);
}

// Reaching for `localStorage` throws where the getter does: Safari with cookies blocked, a sandboxed iframe
function readStored(key: string): string | undefined {
	try {
		return localStorage.getItem(key) ?? undefined;
	} catch {
		return undefined;
	}
}

function readStoredTimeMode(): PlayerTimeMode | undefined {
	const stored = readStored(timeModeStorageKey);

	return stored === 'elapsed' || stored === 'remaining' ? stored : undefined;
}

function readStoredVolume(): number | undefined {
	const stored = readStored(volumeStorageKey);
	if (stored === undefined) return undefined;

	const value = Number(stored);

	return Number.isFinite(value) ? clampVolume(value) : undefined;
}

function writeStored(key: string, value: string): void {
	try {
		localStorage.setItem(key, value);
	} catch {
		return;
	}
}

export const playerStore = createPlayerStore();
