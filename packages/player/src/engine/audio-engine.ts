import type { PlaybackErrorStage } from '#types.ts';

import { createAudioGraph } from '#engine/audio-graph.ts';

// An element inside the graph: the element keeps progressive streaming and native seeking, the graph adds gain and the tap
export interface AudioEngine {
	analyser(): AnalyserNode | undefined;
	canPlay(type: string): boolean;
	currentTime(): number;
	element: HTMLMediaElement;
	load(request: AudioLoadRequest): Promise<void>;
	// How far the element's clock runs ahead of the sound: the graph's delay plus the device's
	outputDelay(): number;
	pause(): void;
	play(): Promise<void>;
	// Builds the graph inside the gesture, before the stream URL's await moves execution out of it
	prepare(): void;
	reset(): void;
	seek(seconds: number): void;
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
	gain: number;
	// Resumes a restored queue where it left off; the element takes it only once metadata has landed
	resumeAtSeconds: number;
	src: string;
}

export function createAudioEngine(callbacks: AudioEngineCallbacks): AudioEngine {
	const audio = new Audio();

	// Without a CORS-approved response the graph outputs silence by spec
	audio.crossOrigin = 'anonymous';
	audio.preload = 'auto';

	const graph = createAudioGraph(audio);

	let pendingResumeAtSeconds: number | undefined;

	// Bumped by every reset, so a play still waiting on the graph cannot start the next track
	let generation = 0;

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
		const startedIn = generation;

		graph.ensure();
		await graph.resume();
		if (startedIn !== generation || callbacks.isPaused()) return;

		try {
			await audio.play();
		} catch (error) {
			// Media failures reach `onError` through the element's error event; a second report from the promise would spend the retry on the same failure
			// The promise alone knows about an autoplay refusal, and a superseding load rejects it with AbortError, which is benign
			if (!(error instanceof DOMException) || error.name !== 'NotAllowedError') return;

			callbacks.onError('network');
		}
	}

	return {
		analyser: graph.analyser,
		canPlay: (type) => audio.canPlayType(type) !== '',
		currentTime: () => audio.currentTime,
		element: audio,
		async load({ gain, resumeAtSeconds, src }) {
			pendingResumeAtSeconds = resumeAtSeconds > 0 ? resumeAtSeconds : undefined;
			graph.setGain(gain);

			audio.src = src;
			audio.load();

			if (callbacks.isPaused()) return;

			callbacks.onStatus('loading');
			await play();
		},
		outputDelay: graph.outputDelay,
		pause: () => {
			audio.pause();
		},
		play,
		prepare: () => {
			graph.ensure();
			void graph.resume();
		},
		// Dropping the source stops the old track downloading against the next; an empty `src` would raise an error event instead
		reset: () => {
			generation += 1;
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
		setVolume: graph.setVolume,
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
