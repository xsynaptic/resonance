import type { EngineDiagnostic, PlaybackErrorStage } from '#types.ts';

// Playback is the element's own, which keeps progressive streaming and native seeking
export interface AudioEngine {
	canPlay(type: string): boolean;
	currentTime(): number;
	element: HTMLMediaElement;
	load(request: AudioLoadRequest): Promise<void>;
	pause(): void;
	play(): Promise<void>;
	reset(): void;
	seek(seconds: number): void;
	// iOS makes `volume` read-only and honours `muted` alone
	setMuted(isMuted: boolean): void;
	setVolume(volume: number): void;
}

export interface AudioEngineCallbacks {
	isPaused: () => boolean;
	onDiagnostic?: (diagnostic: EngineDiagnostic) => void;
	onDuration: (durationSeconds: number) => void;
	onEnded: () => void;
	onError: (stage: PlaybackErrorStage) => void;
	onStatus: (status: 'loading' | 'paused' | 'playing') => void;
	onTime: (currentTimeSeconds: number) => void;
}

// A healthy mobile start takes a few seconds
const stallAfterMs = 20_000;

export type CreateAudioEngine = (callbacks: AudioEngineCallbacks) => AudioEngine;

interface AudioLoadRequest {
	// Resumes a restored queue where it left off; the element takes it only once metadata has landed
	resumeAtSeconds: number;
	src: string;
}

export function createAudioEngine(callbacks: AudioEngineCallbacks): AudioEngine {
	const audio = new Audio();

	// Matches the preconnect's `crossorigin`, so the stream reuses that connection
	audio.crossOrigin = 'anonymous';
	audio.preload = 'auto';

	let pendingResumeAtSeconds: number | undefined;

	// Set while the pause a reset causes is still queued, since it lands after the next load has begun
	let isSilencing = false;

	const watchdog = createStallWatchdog(audio, (diagnostic) => callbacks.onDiagnostic?.(diagnostic));

	audio.addEventListener('timeupdate', () => {
		// Loading zeroes the clock, which is not where a resuming load is headed
		if (pendingResumeAtSeconds !== undefined) return;

		callbacks.onTime(audio.currentTime);
	});
	audio.addEventListener('loadedmetadata', () => {
		// A stream served without a length keeps the queue's duration, which the lock screen needs for its controls
		if (Number.isFinite(audio.duration)) callbacks.onDuration(audio.duration);

		if (pendingResumeAtSeconds === undefined) return;

		audio.currentTime = pendingResumeAtSeconds;
		pendingResumeAtSeconds = undefined;
	});
	audio.addEventListener('ended', () => {
		callbacks.onEnded();
	});
	audio.addEventListener('error', () => {
		watchdog.clear();

		// Before `onError`, so the store holds the browser's own words by the time the status turns
		callbacks.onDiagnostic?.(mediaErrorDiagnostic(audio));
		callbacks.onError(errorStage(audio.error));
	});
	audio.addEventListener('waiting', () => {
		watchdog.arm();
		callbacks.onStatus('loading');
	});
	audio.addEventListener('playing', () => {
		watchdog.played();
		callbacks.onStatus('playing');
	});
	audio.addEventListener('pause', () => {
		if (isSilencing) {
			isSilencing = false;
			return;
		}

		watchdog.clear();
		callbacks.onStatus('paused');
	});

	async function play(): Promise<void> {
		try {
			await audio.play();
		} catch (error) {
			if (error instanceof DOMException && error.name === 'AbortError') return;

			// A refused element never fires `pause`, so nothing else would stand the watchdog down
			watchdog.clear();
			callbacks.onDiagnostic?.(playRejectedDiagnostic(audio, error));

			// Only an autoplay refusal is the promise's to report; a media failure already came through the error event, and AbortError is a superseding load
			if (!(error instanceof DOMException) || error.name !== 'NotAllowedError') return;

			callbacks.onStatus('paused');
		}
	}

	return {
		canPlay: (type) => audio.canPlayType(type) !== '',
		currentTime: () => audio.currentTime,
		element: audio,
		async load({ resumeAtSeconds, src }) {
			pendingResumeAtSeconds = resumeAtSeconds > 0 ? resumeAtSeconds : undefined;
			watchdog.restart();

			audio.src = src;
			audio.load();

			if (callbacks.isPaused()) return;

			callbacks.onStatus('loading');
			watchdog.arm();
			await play();
		},
		pause: () => {
			audio.pause();
		},
		play,
		// Dropping the source stops the old track downloading against the next; an empty `src` would raise an error event instead
		reset: () => {
			pendingResumeAtSeconds = undefined;
			watchdog.clear();
			isSilencing = !audio.paused;
			audio.pause();
			audio.removeAttribute('src');
			audio.load();
		},
		// A seek during the load wins over the offset the load was given
		seek: (seconds) => {
			pendingResumeAtSeconds = undefined;
			audio.currentTime = seconds;
		},
		setMuted: (isMuted) => {
			audio.muted = isMuted;
		},
		setVolume: (volume) => {
			audio.volume = volume;
		},
	};
}

export function snapshotMedia(element: HTMLMediaElement) {
	return {
		networkState: element.networkState,
		positionSeconds: element.currentTime,
		readyState: element.readyState,
	};
}

// Safari before 16.4 has no `userActivation`, which is reported as absent rather than as spent
function activationState() {
	return 'userActivation' in navigator
		? { isActivationLive: navigator.userActivation.isActive }
		: {};
}

function bufferedAhead(element: HTMLMediaElement): number {
	const { buffered, currentTime } = element;

	for (let index = 0; index < buffered.length; index++) {
		if (buffered.start(index) <= currentTime && currentTime <= buffered.end(index)) {
			return buffered.end(index) - currentTime;
		}
	}

	return 0;
}

// Reports once per load and never touches status
function createStallWatchdog(
	element: HTMLMediaElement,
	onStall: (diagnostic: EngineDiagnostic) => void,
) {
	let hasPlayed = false;
	let hasReported = false;
	let timer: ReturnType<typeof setTimeout> | undefined;

	function clear(): void {
		clearTimeout(timer);
		timer = undefined;
	}

	return {
		arm: () => {
			if (timer !== undefined || hasReported) return;

			timer = setTimeout(() => {
				timer = undefined;
				hasReported = true;
				onStall({
					...snapshotMedia(element),
					bufferedAheadSeconds: bufferedAhead(element),
					hasPlayed,
					kind: 'stall',
				});
			}, stallAfterMs);
		},
		clear,
		played: () => {
			hasPlayed = true;
			clear();
		},
		restart: () => {
			hasPlayed = false;
			hasReported = false;
			clear();
		},
	};
}

// Chrome answers MEDIA_ERR_SRC_NOT_SUPPORTED for a missing object as well as an unplayable codec
function errorStage(error: MediaError | null): PlaybackErrorStage {
	switch (error?.code) {
		case MediaError.MEDIA_ERR_DECODE: {
			return 'decode';
		}
		case MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED: {
			return 'unsupported';
		}
		default: {
			return 'network';
		}
	}
}

function mediaErrorDiagnostic(element: HTMLMediaElement): EngineDiagnostic {
	const { error } = element;

	return {
		...snapshotMedia(element),
		...(error ? { code: error.code } : {}),
		kind: 'media-error',
		message: error?.message ?? '',
	};
}

function playRejectedDiagnostic(element: HTMLMediaElement, error: unknown): EngineDiagnostic {
	return {
		...snapshotMedia(element),
		...activationState(),
		kind: 'play-rejected',
		message: error instanceof Error ? error.message : String(error),
		name: error instanceof Error ? error.name : 'unknown',
	};
}
