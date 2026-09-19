import type { StoreApi } from 'zustand/vanilla';

import type { AudioEngine, AudioEngineCallbacks, CreateAudioEngine } from '#engine/audio-engine.ts';
import type { PlayerStore } from '#store/player-types.ts';
import type {
	EngineDiagnostic,
	PlaybackErrorStage,
	PlayerStatus,
	QueuedItem,
	StreamResolution,
} from '#types.ts';

import { snapshotMedia } from '#engine/audio-engine.ts';
import { toDurationSeconds } from '#queue/queue.ts';
import { isAwaitingPlayback, loadedItem } from '#store/selectors.ts';

// Nothing worth resuming stays in the engine after any of these
const terminalStatuses: ReadonlySet<PlayerStatus> = new Set(['capped', 'error', 'unplayable']);

const unplayableState = { isPaused: true, status: 'unplayable' } satisfies Partial<PlayerStore>;

export interface PlaybackController {
	currentTime: () => number | undefined;
	loadIndex: (index: number, shouldAutoplay: boolean, options?: LoadOptions) => void;
	mediaElement: () => HTMLMediaElement | undefined;
	// Clears the intent, which stops a load short of playing wherever it has got to
	pause: () => void;
	play: () => void;
	seek: (seconds: number) => void;
	syncVolume: () => void;
	// Whatever resolve is in flight answers into nothing rather than reloading what was dropped
	unload: () => void;
}

type Diagnostics = ReturnType<typeof createDiagnostics>;

// One trip through resolve-then-load, so a late answer can be recognized as stale
interface LoadAttempt {
	isRetry: boolean;
	isTypeDeclined: boolean;
}

interface LoadOptions {
	isRetry?: boolean;
	resumeAtSeconds?: number;
}

type PressOutcome = 'ignore' | 'resume' | { index: number; resumeAtSeconds: number };

// Every action that reaches audio comes through here
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

	const diagnostics = createDiagnostics(api, () => loading);

	function ensureEngine(): AudioEngine {
		if (engine) return engine;

		engine = createEngine(
			toEngineCallbacks({ api, diagnostics, onError: onEngineError, onPlaying: onEnginePlaying }),
		);
		syncLevel(engine, get());

		return engine;
	}

	// A resolved URL can go stale while the page sits open, so one failure earns one re-resolve from where playback stood
	function onEngineError(stage: PlaybackErrorStage): void {
		const { currentIndex, currentTimeSeconds, isPaused } = get();

		const isUnplayable = stage === 'unsupported' && loading?.isTypeDeclined === true;

		if (!isUnplayable && currentIndex !== undefined && loading && !loading.isRetry) {
			diagnostics.retrying(stage);
			loadIndex(currentIndex, !isPaused, {
				isRetry: true,
				resumeAtSeconds: currentTimeSeconds,
			});
			return;
		}

		fail(stage, isUnplayable);
	}

	// A load that reached playback closes its attempt chain, so a later failure earns a re-resolve of its own
	function onEnginePlaying(): void {
		if (engine) diagnostics.playing(engine.element);
		if (loading) loading.isRetry = false;
	}

	// The element and the play promise can both report one failure; clearing the attempt makes the second a no-op
	function fail(stage: PlaybackErrorStage, isUnplayable = false): void {
		if (loading === undefined) return;

		loading = undefined;
		set(isUnplayable ? unplayableState : errorState(get(), stage));
	}

	// The synchronous half of a load: everything autoplay policy requires to happen inside the gesture
	function loadIndex(
		index: number,
		shouldAutoplay: boolean,
		{ isRetry = false, resumeAtSeconds = 0 }: LoadOptions = {},
	): void {
		const { queue, urls } = get();
		const item = queue[index];
		if (!item || urls === undefined) return;

		set(loadingState({ index, item, resumeAtSeconds, shouldAutoplay }));

		const activeEngine = ensureEngine();

		// Silenced before the next track resolves, so nothing on screen disagrees with what is heard
		if (isSwitch(loadedQueueId, item.queueId)) activeEngine.reset();

		const attempt: LoadAttempt = { isRetry, isTypeDeclined: false };

		loading = attempt;
		loadedQueueId = item.queueId;

		void streamIntoEngine({
			attempt,
			engine: activeEngine,
			isCurrent: () => loading === attempt,
			onCapped: () => {
				set({ isPaused: true, status: 'capped' });
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
			set({ isPaused: false });
			void ensureEngine().play();
			return;
		}

		loadIndex(press.index, true, { resumeAtSeconds: press.resumeAtSeconds });
	}

	return {
		currentTime: () => engine?.currentTime(),
		loadIndex,
		mediaElement: () => engine?.element,

		pause: () => {
			set(pausedState(get().status));
			engine?.pause();
		},

		play,

		seek: (seconds) => {
			ensureEngine().seek(seconds);
		},

		syncVolume() {
			if (engine) syncLevel(engine, get());
		},

		unload() {
			engine?.reset();
			loading = undefined;
			loadedQueueId = undefined;
			set({ currentTimeSeconds: 0, isPaused: true, status: 'idle' });
		},
	};
}

// Every kind happens with a track loaded, so a report without one has nothing to pin it to
function createDiagnostics(api: StoreApi<PlayerStore>, attempt: () => LoadAttempt | undefined) {
	let retriedStage: PlaybackErrorStage | undefined;

	function report(diagnostic: EngineDiagnostic): void {
		const itemId = loadedItem(api.getState())?.itemId;
		if (itemId === undefined) return;

		api.setState({ diagnostic: { ...diagnostic, isRetry: attempt()?.isRetry ?? false, itemId } });
	}

	return {
		// Read before the attempt chain closes, while the attempt still says it is the re-resolve
		playing: (element: HTMLMediaElement) => {
			if (retriedStage === undefined || attempt()?.isRetry !== true) return;

			report({ ...snapshotMedia(element), kind: 'retry-recovered', stage: retriedStage });
		},
		report,
		retrying: (stage: PlaybackErrorStage) => {
			retriedStage = stage;
		},
	};
}

// Without a current track there is nothing to pin the failure to, so the status carries it alone
function errorState(state: PlayerStore, stage: PlaybackErrorStage) {
	const itemId = loadedItem(state)?.itemId;

	return {
		isPaused: true,
		playbackError: itemId === undefined ? undefined : { itemId, stage },
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
		isPaused: !shouldAutoplay,
		playbackError: undefined,
		status: shouldAutoplay ? 'loading' : 'paused',
	} satisfies Partial<PlayerStore>;
}

// A load stopped before the element holds anything reports no pause of its own
function pausedState(status: PlayerStatus) {
	return {
		isPaused: true,
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
	attempt,
	engine,
	isCurrent,
	onCapped,
	onFail,
	readPosition,
	stream,
}: {
	attempt: LoadAttempt;
	engine: AudioEngine;
	isCurrent: () => boolean;
	// Not retried: a re-resolve answers the same
	onCapped: () => void;
	onFail: () => void;
	// Read once the stream resolves, since a seek while it resolved moved the store and not the element
	readPosition: () => number;
	stream: () => Promise<StreamResolution>;
}): Promise<void> {
	try {
		const resolution = await stream();
		if (!isCurrent()) return;

		if (resolution.status === 'capped') {
			onCapped();
			return;
		}

		if (resolution.type !== undefined && !engine.canPlay(resolution.type)) {
			attempt.isTypeDeclined = true;
		}

		await engine.load({ resumeAtSeconds: readPosition(), src: resolution.url });
	} catch {
		if (!isCurrent()) return;

		onFail();
	}
}

function syncLevel(
	engine: AudioEngine,
	{ isMuted, volume }: Pick<PlayerStore, 'isMuted' | 'volume'>,
): void {
	engine.setMuted(isMuted);
	engine.setVolume(volume);
}

// Every report but `onDiagnostic`, `onError` and `onPlaying` is a state write; the retry policy is the caller's
function toEngineCallbacks({
	api,
	diagnostics,
	onError,
	onPlaying,
}: {
	api: StoreApi<PlayerStore>;
	diagnostics: Diagnostics;
	onError: (stage: PlaybackErrorStage) => void;
	onPlaying: () => void;
}): AudioEngineCallbacks {
	const { getState: get, setState: set } = api;

	return {
		isPaused: () => get().isPaused,
		onDiagnostic: diagnostics.report,
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

			if (status === 'playing') onPlaying();

			// The intent follows the element, so a pause from the system or a headset reads as one
			set({ isPaused: status !== 'playing', status });
		},
		onTime: (currentTimeSeconds) => {
			set({ currentTimeSeconds });
		},
	};
}
