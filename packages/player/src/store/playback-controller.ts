import type { StoreApi } from 'zustand/vanilla';

import type { AudioEngine, AudioEngineCallbacks, CreateAudioEngine } from '#engine/audio-engine.ts';
import type { PlayerStore } from '#store/player-types.ts';
import type { PlaybackErrorStage } from '#types.ts';

import { normalizationGain } from '#engine/playback-gain.ts';
import { nextInOrder } from '#queue/queue.ts';

export interface PlaybackController {
	// At the end of the play order, stop without wrapping
	advance: () => void;
	analyser: () => AnalyserNode | undefined;
	currentTime: () => number | undefined;
	// Whether the engine holds this exact queued track; a restored or stopped queue is positioned with nothing in it
	holdsTrack: (queueId: string | undefined) => boolean;
	loadIndex: (index: number, shouldAutoplay: boolean, options?: LoadOptions) => void;
	outputDelay: () => number;
	pause: () => void;
	play: () => void;
	seek: (seconds: number) => void;
	// Clamps into 0..1 and answers with what it applied, so the stored level matches the engine's
	setVolume: (volume: number) => number;
	// Whatever resolve is in flight answers into nothing rather than reloading what was dropped
	unload: () => void;
}

// One trip through resolve-then-load, so a late answer can be recognized as stale
interface LoadAttempt {
	autoplay: boolean;
	index: number;
	isRetry: boolean;
	resumeAtSeconds: number;
}

interface LoadOptions {
	isRetry?: boolean;
	resumeAtSeconds?: number;
}

// Owns the engine and the load state machine; every action that reaches audio comes through here
export function createPlaybackController(
	api: StoreApi<PlayerStore>,
	createEngine: CreateAudioEngine,
): PlaybackController {
	const { getState: get, setState: set } = api;

	// Created on the first action that needs it, inside a user gesture and on the client
	let engine: AudioEngine | undefined;
	let loading: LoadAttempt | undefined;

	// By queue id rather than by index, which a removal or a reorder shifts under the loaded track
	let loadedQueueId: string | undefined;

	function ensureEngine(): AudioEngine {
		if (engine) return engine;

		engine = createEngine(toEngineCallbacks({ advance, onError: onEngineError, set }));
		engine.setVolume(get().volume);

		return engine;
	}

	// A resolved URL can go stale while the page sits open, so one failure earns one re-resolve
	function onEngineError(stage: PlaybackErrorStage): void {
		if (loading && !loading.isRetry) {
			loadIndex(loading.index, loading.autoplay, {
				isRetry: true,
				resumeAtSeconds: loading.resumeAtSeconds,
			});
			return;
		}

		fail(stage);
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
	}

	function loadIndex(
		index: number,
		shouldAutoplay: boolean,
		{ isRetry = false, resumeAtSeconds = 0 }: LoadOptions = {},
	): void {
		const state = get();
		const item = state.queue[index];
		if (!item || state.urls === undefined) return;

		set({
			currentIndex: index,
			currentTimeSeconds: resumeAtSeconds,
			durationSeconds: item.durationMs === undefined ? undefined : item.durationMs / 1000,
			playbackError: undefined,
			status: 'loading',
		});

		const gain = normalizationGain(item, state.isShuffling);

		// Before the await: autoplay policy admits the graph only while still inside the gesture
		const activeEngine = ensureEngine();
		if (shouldAutoplay) activeEngine.prepare();

		const attempt: LoadAttempt = { autoplay: shouldAutoplay, index, isRetry, resumeAtSeconds };

		loading = attempt;
		loadedQueueId = item.queueId;

		void state.urls
			.stream(item.trackId)
			.then(async (resolution) => {
				if (loading !== attempt) return;

				// Not retried: a re-resolve would answer the same
				if (resolution.status === 'capped') {
					set({ status: 'capped' });
					return;
				}

				await activeEngine.load({ gain, resumeAtSeconds, shouldAutoplay, src: resolution.url });
			})
			.catch(() => {
				if (loading !== attempt) return;

				fail('resolve');
			});
	}

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

	return {
		advance,
		analyser: () => engine?.analyser(),
		currentTime: () => engine?.currentTime(),
		holdsTrack: (queueId) => loadedQueueId === queueId,
		loadIndex,
		outputDelay: () => engine?.outputDelay() ?? 0,

		pause: () => {
			engine?.pause();
		},

		play: () => {
			void ensureEngine().play();
		},

		seek: (seconds) => {
			ensureEngine().seek(seconds);
		},

		setVolume(volume) {
			const clamped = Math.min(1, Math.max(0, volume));

			engine?.setVolume(clamped);

			return clamped;
		},

		unload() {
			engine?.reset();
			loading = undefined;
			loadedQueueId = undefined;
		},
	};
}

// Every report but `onError` is a straight state write; the retry policy is the caller's
function toEngineCallbacks({
	advance,
	onError,
	set,
}: {
	advance: () => void;
	onError: (stage: PlaybackErrorStage) => void;
	set: StoreApi<PlayerStore>['setState'];
}): AudioEngineCallbacks {
	return {
		onDuration: (durationSeconds) => {
			set({ durationSeconds });
		},
		onEnded: advance,
		onError,
		onStatus: (status) => {
			set({ status });
		},
		onTime: (currentTimeSeconds) => {
			set({ currentTimeSeconds });
		},
	};
}
