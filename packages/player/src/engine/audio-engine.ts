import type { PlaybackErrorStage } from '#types.ts';

// An element inside the graph: the element keeps progressive streaming and native seeking, the graph adds gain and the tap
export interface AudioEngine {
	analyser(): AnalyserNode | undefined;
	currentTime(): number;
	// `startS` resumes a restored queue where it left off; the element takes it only once metadata has landed
	load(src: string, gain: number, shouldAutoplay: boolean, startS: number): Promise<void>;
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
	onDuration: (durationS: number | undefined) => void;
	onEnded: () => void;
	onError: (stage: PlaybackErrorStage) => void;
	onStatus: (status: 'loading' | 'paused' | 'playing') => void;
	onTime: (currentTimeS: number) => void;
}

export type CreateAudioEngine = (callbacks: AudioEngineCallbacks) => AudioEngine;

export function createAudioEngine(callbacks: AudioEngineCallbacks): AudioEngine {
	const audio = new Audio();

	// Without a CORS-approved response the graph outputs silence by spec
	audio.crossOrigin = 'anonymous';
	audio.preload = 'auto';

	let context: AudioContext | undefined;
	let normalizationNode: GainNode | undefined;
	let volumeNode: GainNode | undefined;
	let analyserNode: AnalyserNode | undefined;
	let analysisDelayS = 0;

	// Applied to the live nodes once the graph exists
	let pendingGain = 1;
	let pendingVolume = 1;
	let pendingStartS: number | undefined;

	// A media element source can be created once, so the graph is built once, inside the first gesture
	function ensureGraph(): void {
		if (context) return;

		context = new AudioContext();
		normalizationNode = context.createGain();
		volumeNode = context.createGain();
		analyserNode = context.createAnalyser();

		// 4096 gives the low bands the resolution this catalogue needs; 0.3 keeps attacks sharp for a visualizer
		// Time-domain reads are unaffected by the smoothing
		analyserNode.fftSize = 4096;
		analyserNode.smoothingTimeConstant = 0.3;
		normalizationNode.gain.value = pendingGain;
		volumeNode.gain.value = pendingVolume;

		// Playback waits for the analysis window rather than the display trailing the sound
		analysisDelayS = analysisDelaySeconds(analyserNode);

		const delayNode = context.createDelay(1);

		delayNode.delayTime.value = analysisDelayS;

		// The tap sits ahead of the volume stage so the display follows the track, not the volume knob
		context
			.createMediaElementSource(audio)
			.connect(normalizationNode)
			.connect(analyserNode)
			.connect(delayNode)
			.connect(volumeNode)
			.connect(context.destination);
	}

	audio.addEventListener('timeupdate', () => {
		callbacks.onTime(audio.currentTime);
	});
	audio.addEventListener('loadedmetadata', () => {
		callbacks.onDuration(Number.isFinite(audio.duration) ? audio.duration : undefined);

		if (pendingStartS === undefined) return;

		audio.currentTime = pendingStartS;
		pendingStartS = undefined;
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
		callbacks.onStatus('paused');
	});

	async function play(): Promise<void> {
		ensureGraph();
		if (context?.state === 'suspended') await context.resume();

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
		analyser: () => analyserNode,
		currentTime: () => audio.currentTime,
		async load(src, gain, shouldAutoplay, startS) {
			pendingGain = gain;
			pendingStartS = startS > 0 ? startS : undefined;
			if (normalizationNode) normalizationNode.gain.value = gain;

			audio.src = src;
			audio.load();

			if (!shouldAutoplay) return;

			callbacks.onStatus('loading');
			await play();
		},
		outputDelay: () => (context === undefined ? 0 : analysisDelayS + outputLatencyS(context)),
		pause: () => {
			audio.pause();
		},
		play,
		prepare: () => {
			ensureGraph();
			if (context?.state === 'suspended') void context.resume();
		},
		reset: () => {
			audio.pause();
			pendingStartS = undefined;
			audio.currentTime = 0;
		},
		// A seek during the load wins over the offset the load was given
		seek: (seconds) => {
			pendingStartS = undefined;
			audio.currentTime = seconds;
		},
		setVolume: (volume) => {
			pendingVolume = volume;
			if (volumeNode) volumeNode.gain.value = volume;
		},
	};
}

// The analyser's window weights a transient fully only at its midpoint, and output latency is a credit against that lag
// Floored at zero because a long output latency (Bluetooth) already puts the display ahead
function analysisDelaySeconds(analyser: AnalyserNode): number {
	const windowCentreS = analyser.fftSize / 2 / analyser.context.sampleRate;

	return Math.max(0, windowCentreS - outputLatencyS(analyser.context));
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

// Only AudioContext carries outputLatency, and an analyser types its context as the base class
function outputLatencyS(context: BaseAudioContext): number {
	const latency: unknown = (context as { outputLatency?: unknown }).outputLatency;

	return typeof latency === 'number' ? latency : 0;
}
