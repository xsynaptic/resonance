import type { PlaybackErrorStage } from '#types.ts';

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
	onDuration: (durationSeconds: number | undefined) => void;
	onEnded: () => void;
	onError: (stage: PlaybackErrorStage) => void;
	onStatus: (status: 'loading' | 'paused' | 'playing') => void;
	onTime: (currentTimeSeconds: number) => void;
}

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

	audio.addEventListener('timeupdate', () => {
		// Loading zeroes the clock, which is not where a resuming load is headed
		if (pendingResumeAtSeconds !== undefined) return;

		callbacks.onTime(audio.currentTime);
	});
	audio.addEventListener('loadedmetadata', () => {
		callbacks.onDuration(Number.isFinite(audio.duration) ? audio.duration : undefined);

		if (pendingResumeAtSeconds === undefined) return;

		audio.currentTime = pendingResumeAtSeconds;
		pendingResumeAtSeconds = undefined;
	});
	audio.addEventListener('ended', () => {
		callbacks.onEnded();
	});
	audio.addEventListener('error', () => {
		callbacks.onError(errorStage(audio.error));
	});
	audio.addEventListener('waiting', () => {
		callbacks.onStatus('loading');
	});
	audio.addEventListener('playing', () => {
		callbacks.onStatus('playing');
	});
	audio.addEventListener('pause', () => {
		if (isSilencing) {
			isSilencing = false;
			return;
		}

		callbacks.onStatus('paused');
	});

	async function play(): Promise<void> {
		try {
			await audio.play();
		} catch (error) {
			// Only an autoplay refusal is the promise's to report; a media failure already came through the error event, and AbortError is a superseding load
			if (!(error instanceof DOMException) || error.name !== 'NotAllowedError') return;

			callbacks.onError('network');
		}
	}

	return {
		canPlay: (type) => audio.canPlayType(type) !== '',
		currentTime: () => audio.currentTime,
		element: audio,
		async load({ resumeAtSeconds, src }) {
			pendingResumeAtSeconds = resumeAtSeconds > 0 ? resumeAtSeconds : undefined;

			audio.src = src;
			audio.load();

			if (callbacks.isPaused()) return;

			callbacks.onStatus('loading');
			await play();
		},
		pause: () => {
			audio.pause();
		},
		play,
		// Dropping the source stops the old track downloading against the next; an empty `src` would raise an error event instead
		reset: () => {
			pendingResumeAtSeconds = undefined;
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
