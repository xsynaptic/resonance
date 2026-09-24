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
	silence(): void;
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
	const elements = [createElement(), createElement()] as const;

	let [audio] = elements;
	let isSparePrimed = false;
	let parked: HTMLAudioElement | undefined;
	let pendingResumeAtSeconds: number | undefined;

	const watchdog = createStallWatchdog(() => audio, callbacks);
	const listen = (type: keyof HTMLMediaElementEventMap, handler: () => void): void => {
		listenWhileCurrent({ current: () => audio, elements, handler, type });
	};

	function unpark(): void {
		if (parked === undefined) return;

		empty(parked);
		parked = undefined;
	}

	listen('timeupdate', () => {
		// Loading zeroes the clock, which is not where a resuming load is headed
		if (pendingResumeAtSeconds !== undefined) return;

		callbacks.onTime(audio.currentTime);
	});
	listen('loadedmetadata', () => {
		// A stream served without a length keeps the queue's duration, which the lock screen needs for its controls
		if (Number.isFinite(audio.duration)) callbacks.onDuration(audio.duration);

		if (pendingResumeAtSeconds === undefined) return;

		audio.currentTime = pendingResumeAtSeconds;
		pendingResumeAtSeconds = undefined;
	});
	listen('ended', () => {
		callbacks.onEnded();
	});
	listen('error', () => {
		watchdog.clear();

		// Before `onError`, so the store holds the browser's own words by the time the status turns
		callbacks.onDiagnostic?.(mediaErrorDiagnostic(audio));
		callbacks.onError(errorStage(audio.error));
	});
	listen('waiting', () => {
		watchdog.arm();
		callbacks.onStatus('loading');
	});
	listen('playing', () => {
		watchdog.played();
		unpark();
		callbacks.onStatus('playing');
	});
	listen('pause', () => {
		watchdog.clear();
		callbacks.onStatus('paused');
	});

	const play = (): Promise<void> => playElement(audio, { callbacks, watchdog });

	return {
		canPlay: (type) => audio.canPlayType(type) !== '',
		currentTime: () => audio.currentTime,
		get element() {
			return audio;
		},
		async load({ resumeAtSeconds, src }) {
			pendingResumeAtSeconds = resumeAtSeconds > 0 ? resumeAtSeconds : undefined;
			watchdog.restart();

			audio.src = src;
			audio.load();

			if (callbacks.isPaused()) return;

			callbacks.onStatus('loading');
			watchdog.arm();

			const started = play();

			if (!isSparePrimed) {
				isSparePrimed = true;
				void prime(otherOf(elements, audio));
			}

			await started;
		},
		pause: () => {
			audio.pause();
		},
		play,
		reset: () => {
			pendingResumeAtSeconds = undefined;
			watchdog.clear();
			unpark();
			empty(audio);
		},
		// A seek during the load wins over the offset the load was given
		seek: (seconds) => {
			pendingResumeAtSeconds = undefined;
			audio.currentTime = seconds;
		},
		setMuted: (isMuted) => {
			for (const element of elements) element.muted = isMuted;
		},
		setVolume: (volume) => {
			for (const element of elements) element.volume = volume;
		},
		silence: () => {
			pendingResumeAtSeconds = undefined;
			watchdog.clear();
			unpark();
			audio.pause();
			parked = audio;
			audio = otherOf(elements, audio);
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

function createElement(): HTMLAudioElement {
	const element = new Audio();

	// Matches the preconnect's `crossorigin`, so the stream reuses that connection
	element.crossOrigin = 'anonymous';
	element.preload = 'auto';

	return element;
}

// Reports once per load and never touches status
function createStallWatchdog(
	current: () => HTMLMediaElement,
	{ onDiagnostic }: Pick<AudioEngineCallbacks, 'onDiagnostic'>,
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
				const element = current();

				onDiagnostic?.({
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

// Dropping the source stops the old track downloading against the next; an empty `src` would raise an error event instead
function empty(element: HTMLMediaElement): void {
	element.pause();
	element.removeAttribute('src');
	element.load();
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

function isDomException(error: unknown, name: string) {
	return error instanceof DOMException && error.name === name;
}

function listenWhileCurrent({
	current,
	elements,
	handler,
	type,
}: {
	current: () => HTMLMediaElement;
	elements: ReadonlyArray<HTMLMediaElement>;
	handler: () => void;
	type: keyof HTMLMediaElementEventMap;
}): void {
	for (const element of elements) {
		element.addEventListener(type, (event) => {
			if (event.currentTarget === current()) handler();
		});
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

function otherOf(
	elements: readonly [HTMLAudioElement, HTMLAudioElement],
	element: HTMLAudioElement,
): HTMLAudioElement {
	return element === elements[0] ? elements[1] : elements[0];
}

async function playElement(
	element: HTMLMediaElement,
	{ callbacks, watchdog }: { callbacks: AudioEngineCallbacks; watchdog: { clear: () => void } },
): Promise<void> {
	try {
		await element.play();
	} catch (error) {
		if (isDomException(error, 'AbortError')) return;

		// A refused element never fires `pause`, so nothing else would stand the watchdog down
		watchdog.clear();

		// A failed source already sent `media-error`; `play-rejected` stays for refusals
		if (isDomException(error, 'NotSupportedError')) return;

		callbacks.onDiagnostic?.(playRejectedDiagnostic(element, error));

		// Only an autoplay refusal is the promise's to report; a media failure already came through the error event, and AbortError is a superseding load
		if (!isDomException(error, 'NotAllowedError')) return;

		callbacks.onStatus('paused');
	}
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

async function prime(element: HTMLMediaElement): Promise<void> {
	const started = element.play();

	element.pause();
	await Promise.allSettled([started]);
}
