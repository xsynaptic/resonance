import type { PlacedCuePoint } from '#waveform/cue-points.ts';
import type { WaveformRendering, WaveformSpan } from '#waveform/overview/overview-render.ts';

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
	durationSeconds: number;
	rect: DOMRect;
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

// The paint guard's share of the key, so a `progress` event that moves no edge paints nothing
export function bufferedKey(spans: ReadonlyArray<WaveformSpan>): string {
	return spans.map(({ fromPx, toPx }) => `${String(fromPx)}-${String(toPx)}`).join(',');
}

// Every range the element holds, not only the furthest end
export function bufferedSpans(
	ranges: TimeRanges | undefined,
	durationSeconds: number | undefined,
	width: number,
): Array<WaveformSpan> {
	if (ranges === undefined || !durationSeconds || durationSeconds <= 0) return [];

	const spans: Array<WaveformSpan> = [];

	for (let index = 0; index < ranges.length; index += 1) {
		const fromPx = pixelAt(ranges.start(index), durationSeconds, width) ?? 0;
		const toPx = pixelAt(ranges.end(index), durationSeconds, width) ?? 0;

		// A range narrower than a device pixel draws nothing, and keeping it would repaint on every growth
		if (toPx > fromPx) spans.push({ fromPx, toPx });
	}

	return spans;
}

export function cuePointAtPointer(
	rendering: undefined | WaveformRendering,
	rect: DOMRect,
	pointer: { clientX: number; clientY: number },
): PlacedCuePoint | undefined {
	if (rendering === undefined || rendering.cuePoints.length === 0) return undefined;
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

export function pointerRatio(rect: DOMRect, pointer: { clientX: number }): number {
	return Math.min(1, Math.max(0, (pointer.clientX - rect.left) / rect.width));
}

// A press over a cue point lands on its start, so a drag across one snaps to it
export function scrubSecondsAt(
	{ durationSeconds, rect, rendering }: ScrubTarget,
	pointer: { clientX: number; clientY: number },
): number {
	const ratio = pointerRatio(rect, pointer);

	return (
		cuePointAtPointer(rendering, rect, pointer)?.cuePoint.startSeconds ?? ratio * durationSeconds
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
