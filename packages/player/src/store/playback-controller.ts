import type { StoreApi } from 'zustand/vanilla';

import type { AudioEngine, AudioEngineCallbacks, CreateAudioEngine } from '#engine/audio-engine.ts';
import type { PlayerStore } from '#store/player-types.ts';
import type { PlaybackErrorStage, QueuedItem, StreamResolution } from '#types.ts';

import { normalizationGain } from '#engine/playback-gain.ts';
import { nextInOrder, toDurationSeconds } from '#queue/queue.ts';

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
		set(errorState(get(), stage));
	}

	// The synchronous half of a load: everything autoplay policy requires to happen inside the gesture
	function loadIndex(
		index: number,
		shouldAutoplay: boolean,
		{ isRetry = false, resumeAtSeconds = 0 }: LoadOptions = {},
	): void {
		const { isShuffling, queue, urls } = get();
		const item = queue[index];
		if (!item || urls === undefined) return;

		set(loadingState(index, item, resumeAtSeconds));

		const activeEngine = ensureEngine();
		if (shouldAutoplay) activeEngine.prepare();

		const attempt: LoadAttempt = { autoplay: shouldAutoplay, index, isRetry, resumeAtSeconds };

		loading = attempt;
		loadedQueueId = item.queueId;

		void streamIntoEngine({
			engine: activeEngine,
			isCurrent: () => loading === attempt,
			onCapped: () => {
				set({ status: 'capped' });
			},
			onFail: () => {
				fail('resolve');
			},
			request: { gain: normalizationGain(item, isShuffling), resumeAtSeconds, shouldAutoplay },
			stream: () => urls.stream(item.trackId),
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

// Without a current track there is nothing to pin the failure to, so the status carries it alone
function errorState(state: PlayerStore, stage: PlaybackErrorStage) {
	const trackId =
		state.currentIndex === undefined ? undefined : state.queue[state.currentIndex]?.trackId;

	return {
		playbackError: trackId === undefined ? undefined : { stage, trackId },
		status: 'error',
	} satisfies Partial<PlayerStore>;
}

// Positions the store on a track before anything has resolved; the duration is the queue's until metadata lands
function loadingState(index: number, item: QueuedItem, resumeAtSeconds: number) {
	return {
		currentIndex: index,
		currentTimeSeconds: resumeAtSeconds,
		durationSeconds: toDurationSeconds(item),
		playbackError: undefined,
		status: 'loading',
	} satisfies Partial<PlayerStore>;
}

// The asynchronous half of a load, which runs outside the gesture and may answer for an attempt that has since been dropped
async function streamIntoEngine({
	engine,
	isCurrent,
	onCapped,
	onFail,
	request,
	stream,
}: {
	engine: AudioEngine;
	isCurrent: () => boolean;
	onCapped: () => void;
	onFail: () => void;
	// Everything the engine needs but the URL, which is what this resolves
	request: { gain: number; resumeAtSeconds: number; shouldAutoplay: boolean };
	stream: () => Promise<StreamResolution>;
}): Promise<void> {
	try {
		const resolution = await stream();
		if (!isCurrent()) return;

		// Not retried: a re-resolve would answer the same
		if (resolution.status === 'capped') {
			onCapped();
			return;
		}

		await engine.load({ ...request, src: resolution.url });
	} catch {
		if (!isCurrent()) return;

		onFail();
	}
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
