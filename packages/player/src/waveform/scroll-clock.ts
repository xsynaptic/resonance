import type { SubscribeTime } from '#types.ts';

// Both clocks a waveform can read advance in steps, so the frame timestamp runs the position and the audio clock only corrects it

// Past this the source was seeked rather than drifted, so the position snaps instead of sliding
const seekThresholdS = 0.5;

// Share of the error closed each frame; the gap halves in about a dozen of them
const catchUpPerFrame = 0.06;

export interface ScrollClock {
	// `frameMs` is the rAF timestamp: presentation time, not when the callback ran
	read: (frameMs: number, isPlaying: boolean) => number;
	stop: () => void;
}

export function createScrollClock(
	subscribeTime: SubscribeTime,
	getCurrentTime: () => number | undefined,
): ScrollClock {
	let positionS = 0;
	let lastFrameMs: number | undefined;
	let hasPosition = false;
	let storeS = 0;

	// Covers the window before the engine exists and there is no element clock to read
	const unsubscribe = subscribeTime((seconds) => {
		storeS = seconds;
	});

	return {
		read: (frameMs, isPlaying) => {
			const sourceS = getCurrentTime() ?? storeS;
			const elapsedS = lastFrameMs === undefined ? 0 : (frameMs - lastFrameMs) / 1000;

			lastFrameMs = frameMs;

			if (isPlaying) positionS += elapsedS;

			// Paused, unseeded, or seeked: sliding across a seek would sweep the whole span between
			if (!hasPosition || !isPlaying || Math.abs(sourceS - positionS) > seekThresholdS) {
				positionS = sourceS;
				hasPosition = true;
			} else {
				positionS += (sourceS - positionS) * catchUpPerFrame;
			}

			return Math.max(0, positionS);
		},
		stop: unsubscribe,
	};
}
