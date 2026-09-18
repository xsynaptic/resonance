import type { SubscribeTime } from '#types.ts';

// Both clocks a waveform can read advance in steps, so the frame timestamp runs the position and the audio clock only corrects it

// Past this the source was seeked rather than drifted, so the position snaps instead of sliding
const seekThresholdSeconds = 0.5;

// Share of the error closed each frame; the gap halves in about a dozen of them
const catchUpPerFrame = 0.06;

export interface ScrollClock {
	// Audible seconds: the element's clock less the device's output buffer
	// `frameMs` is the rAF timestamp: presentation time, not when the callback ran
	read: (frameMs: number, isPlaying: boolean) => number;
	stop: () => void;
	toElementSeconds: (audibleSeconds: number) => number;
}

interface ScrollClockSources {
	elementTime: () => number | undefined;
	outputDelay: () => number;
	subscribeTime: SubscribeTime;
}

export function createScrollClock({
	elementTime,
	outputDelay,
	subscribeTime,
}: ScrollClockSources): ScrollClock {
	let positionSeconds = 0;
	let lastFrameMs: number | undefined;
	let hasPosition = false;
	let storeTimeSeconds = 0;

	// Covers the window before the engine exists and there is no element clock to read
	const unsubscribe = subscribeTime((seconds) => {
		storeTimeSeconds = seconds;
	});

	return {
		read: (frameMs, isPlaying) => {
			const sourceTimeSeconds = elementTime() ?? storeTimeSeconds;
			const elapsedSeconds = lastFrameMs === undefined ? 0 : (frameMs - lastFrameMs) / 1000;

			lastFrameMs = frameMs;

			if (isPlaying) positionSeconds += elapsedSeconds;

			// Paused, unseeded, or seeked: sliding across a seek would sweep the whole span between
			if (
				!hasPosition ||
				!isPlaying ||
				Math.abs(sourceTimeSeconds - positionSeconds) > seekThresholdSeconds
			) {
				positionSeconds = sourceTimeSeconds;
				hasPosition = true;
			} else {
				positionSeconds += (sourceTimeSeconds - positionSeconds) * catchUpPerFrame;
			}

			return Math.max(0, positionSeconds - outputDelay());
		},
		stop: unsubscribe,
		toElementSeconds: (audibleSeconds) => audibleSeconds + outputDelay(),
	};
}
