import type { PlacedCuePoint } from '#waveform/cue-points.ts';
import type { WaveformRendering } from '#waveform/waveform-render.ts';

import { cuePointAt } from '#waveform/cue-points.ts';

// Coarse for a mix that runs hours, but the steps a slider is expected to answer to
const arrowStepSeconds = 5;
const pageStepSeconds = 60;

// In CSS pixels: the 0.25rem a pointer can miss a cue point's edge by
const hitMarginPx = 4;

// A click seeks without drawing the scrub; only a press held past this shows where the release will land
export const holdDelayMs = 150;

interface KeyScrub {
	currentSeconds: number;
	durationSeconds: number;
	scrubSeconds: number | undefined;
}

interface ScrubTarget {
	canvas: Element;
	durationSeconds: number;
	rendering: undefined | WaveformRendering;
}

const keyStepsSeconds = new Map<string, number>([
	['ArrowDown', -arrowStepSeconds],
	['ArrowLeft', -arrowStepSeconds],
	['ArrowRight', arrowStepSeconds],
	['ArrowUp', arrowStepSeconds],
	['PageDown', -pageStepSeconds],
	['PageUp', pageStepSeconds],
]);

export function cuePointAtPointer(
	rendering: undefined | WaveformRendering,
	canvas: Element,
	pointer: { clientX: number; clientY: number },
): PlacedCuePoint | undefined {
	if (rendering === undefined || rendering.cuePoints.length === 0) return undefined;

	const rect = canvas.getBoundingClientRect();
	if (rect.width === 0 || rect.height === 0) return undefined;

	return cuePointAt(
		rendering.cuePoints,
		{
			x: ((pointer.clientX - rect.left) * rendering.width) / rect.width,
			y: ((pointer.clientY - rect.top) * rendering.height) / rect.height,
		},
		rendering.cuePointSize / 2 + hitMarginPx * rendering.ratio,
	);
}

export function isSliderKey(key: string): boolean {
	return key === 'Home' || key === 'End' || keyStepsSeconds.has(key);
}

// Auto-repeat moves the scrub as a held pointer does, so a held key costs one seek on release rather than one per repeat
export function keyScrubSeconds(
	event: { key: string; repeat: boolean },
	{ currentSeconds, durationSeconds, scrubSeconds }: KeyScrub,
): number | undefined {
	const fromSeconds = event.repeat ? (scrubSeconds ?? currentSeconds) : currentSeconds;
	const target = keyTarget(event.key, fromSeconds, durationSeconds);
	if (target === undefined) return undefined;

	return Math.min(durationSeconds, Math.max(0, target));
}

export function pixelAt(
	seconds: number | undefined,
	durationSeconds: number | undefined,
	width: number,
): number | undefined {
	if (seconds === undefined) return undefined;
	if (!durationSeconds || durationSeconds <= 0) return 0;

	return Math.round(Math.min(1, Math.max(0, seconds / durationSeconds)) * width);
}

// A press over a cue point lands on its start, so a drag across one snaps to it
export function scrubSecondsAt(
	{ canvas, durationSeconds, rendering }: ScrubTarget,
	pointer: { clientX: number; clientY: number },
): number {
	const rect = canvas.getBoundingClientRect();
	const ratio = Math.min(1, Math.max(0, (pointer.clientX - rect.left) / rect.width));

	return (
		cuePointAtPointer(rendering, canvas, pointer)?.cuePoint.startSeconds ?? ratio * durationSeconds
	);
}

// The keys `role="slider"` contracts for; anything else falls through to the page
function keyTarget(
	key: string,
	currentTimeSeconds: number,
	durationSeconds: number,
): number | undefined {
	if (key === 'Home') return 0;
	if (key === 'End') return durationSeconds;

	const step = keyStepsSeconds.get(key);

	return step === undefined ? undefined : currentTimeSeconds + step;
}
