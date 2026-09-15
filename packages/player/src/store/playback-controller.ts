import type { StoreApi } from 'zustand/vanilla';

import type { AudioEngine, AudioEngineCallbacks, CreateAudioEngine } from '#engine/audio-engine.ts';
import type { PlayerStore } from '#store/player-types.ts';
import type { PlaybackErrorStage, PlayerStatus, QueuedItem, StreamResolution } from '#types.ts';

import { normalizationGain } from '#engine/playback-gain.ts';
import { toDurationSeconds } from '#queue/queue.ts';
import { isAwaitingPlayback, loadedItem } from '#store/selectors.ts';

// Nothing worth resuming stays in the engine after any of these
const terminalStatuses: ReadonlySet<PlayerStatus> = new Set(['capped', 'error', 'unplayable']);

export interface PlaybackController {
	analyser: () => AnalyserNode | undefined;
	currentTime: () => number | undefined;
	loadIndex: (index: number, shouldAutoplay: boolean, options?: LoadOptions) => void;
	outputDelay: () => number;
	// Clears the intent, which stops a load short of playing wherever it has got to
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
	isRetry: boolean;
}

interface LoadOptions {
	isRetry?: boolean;
	resumeAtSeconds?: number;
}

type PressOutcome = 'ignore' | 'resume' | { index: number; resumeAtSeconds: number };

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

		engine = createEngine(toEngineCallbacks({ api, onError: onEngineError }));
		engine.setVolume(get().volume);

		return engine;
	}

	// A resolved URL can go stale while the page sits open, so one failure earns one re-resolve from where playback stood
	function onEngineError(stage: PlaybackErrorStage): void {
		const { currentIndex, currentTimeSeconds, isPlayIntended } = get();

		if (currentIndex !== undefined && loading && !loading.isRetry) {
			loadIndex(currentIndex, isPlayIntended, {
				isRetry: true,
				resumeAtSeconds: currentTimeSeconds,
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

		set(loadingState({ index, item, resumeAtSeconds, shouldAutoplay }));

		const activeEngine = ensureEngine();

		// Silenced before the next track resolves, so nothing on screen disagrees with what is heard
		if (isSwitch(loadedQueueId, item.queueId)) activeEngine.reset();
		if (shouldAutoplay) activeEngine.prepare();

		const attempt: LoadAttempt = { isRetry };

		loading = attempt;
		loadedQueueId = item.queueId;

		void streamIntoEngine({
			engine: activeEngine,
			gain: normalizationGain(item, isShuffling),
			isCurrent: () => loading === attempt,
			onDeclined: (status) => {
				set({ isPlayIntended: false, status });
			},
			onFail: () => {
				fail('resolve');
			},
			readPosition: () => get().currentTimeSeconds,
			stream: () => urls.stream(item),
		});
	}

	function play(): void {
		const press = pressOutcome(get(), loadedQueueId);
		if (press === 'ignore') return;

		if (press === 'resume') {
			set({ isPlayIntended: true });
			void ensureEngine().play();
			return;
		}

		loadIndex(press.index, true, { resumeAtSeconds: press.resumeAtSeconds });
	}

	return {
		analyser: () => engine?.analyser(),
		currentTime: () => engine?.currentTime(),
		loadIndex,
		outputDelay: () => engine?.outputDelay() ?? 0,

		pause: () => {
			set(pausedState(get().status));
			engine?.pause();
		},

		play,

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
			set({ currentTimeSeconds: 0, isPlayIntended: false, status: 'idle' });
		},
	};
}

// Without a current track there is nothing to pin the failure to, so the status carries it alone
function errorState(state: PlayerStore, stage: PlaybackErrorStage) {
	const trackId = loadedItem(state)?.trackId;

	return {
		isPlayIntended: false,
		playbackError: trackId === undefined ? undefined : { stage, trackId },
		status: 'error',
	} satisfies Partial<PlayerStore>;
}

function isSwitch(loadedQueueId: string | undefined, queueId: string): boolean {
	return loadedQueueId !== undefined && loadedQueueId !== queueId;
}

// Positions the store on a track before anything has resolved; the duration is the queue's until metadata lands
function loadingState({
	index,
	item,
	resumeAtSeconds,
	shouldAutoplay,
}: {
	index: number;
	item: QueuedItem;
	resumeAtSeconds: number;
	shouldAutoplay: boolean;
}) {
	return {
		currentIndex: index,
		currentTimeSeconds: resumeAtSeconds,
		durationSeconds: toDurationSeconds(item),
		isPlayIntended: shouldAutoplay,
		playbackError: undefined,
		status: shouldAutoplay ? 'loading' : 'paused',
	} satisfies Partial<PlayerStore>;
}

// A load stopped before the element holds anything reports no pause of its own
function pausedState(status: PlayerStatus) {
	return {
		isPlayIntended: false,
		status: status === 'loading' ? 'paused' : status,
	} satisfies Partial<PlayerStore>;
}

function pressOutcome(state: PlayerStore, loadedQueueId: string | undefined): PressOutcome {
	if (state.currentIndex === undefined) {
		const first = state.playOrder[0];

		return first === undefined ? 'ignore' : { index: first, resumeAtSeconds: 0 };
	}

	if (isAwaitingPlayback(state)) return 'ignore';

	// A restored or stopped queue is positioned with nothing in the engine, so the press loads it where it stands
	if (terminalStatuses.has(state.status) || loadedItem(state)?.queueId !== loadedQueueId) {
		return { index: state.currentIndex, resumeAtSeconds: state.currentTimeSeconds };
	}

	return 'resume';
}

// The asynchronous half of a load, which runs outside the gesture and may answer for an attempt that has since been dropped
async function streamIntoEngine({
	engine,
	gain,
	isCurrent,
	onDeclined,
	onFail,
	readPosition,
	stream,
}: {
	engine: AudioEngine;
	gain: number;
	isCurrent: () => boolean;
	// Neither is retried: a re-resolve answers the same, and so does the browser for the same format
	onDeclined: (status: 'capped' | 'unplayable') => void;
	onFail: () => void;
	// Read once the stream resolves, since a seek while it resolved moved the store and not the element
	readPosition: () => number;
	stream: () => Promise<StreamResolution>;
}): Promise<void> {
	try {
		const resolution = await stream();
		if (!isCurrent()) return;

		if (resolution.status === 'capped') {
			onDeclined('capped');
			return;
		}

		if (resolution.type !== undefined && !engine.canPlay(resolution.type)) {
			onDeclined('unplayable');
			return;
		}

		await engine.load({ gain, resumeAtSeconds: readPosition(), src: resolution.url });
	} catch {
		if (!isCurrent()) return;

		onFail();
	}
}

// Every report but `onError` is a state write; the retry policy is the caller's
function toEngineCallbacks({
	api,
	onError,
}: {
	api: StoreApi<PlayerStore>;
	onError: (stage: PlaybackErrorStage) => void;
}): AudioEngineCallbacks {
	const { getState: get, setState: set } = api;

	return {
		isPlayIntended: () => get().isPlayIntended,
		onDuration: (durationSeconds) => {
			set({ durationSeconds });
		},
		onEnded: () => {
			get().next();
		},
		onError,
		onStatus: (status) => {
			if (status === 'loading') {
				set({ status });
				return;
			}

			// An unload has already left nothing loaded
			if (status === 'paused' && get().status === 'idle') return;

			// The intent follows the element, so a pause from the system or a headset reads as one
			set({ isPlayIntended: status === 'playing', status });
		},
		onTime: (currentTimeSeconds) => {
			set({ currentTimeSeconds });
		},
	};
}
