import type { WaveformSpan } from '#waveform/overview/overview-render.ts';

import { pixelAt } from '#elements/time-slider/overview-scrub.ts';

// The paint guard's share of the key, so a `progress` event that moves no edge paints nothing
export function bufferedKey(spans: ReadonlyArray<WaveformSpan>): string {
	return spans.map(({ fromPx, toPx }) => `${String(fromPx)}-${String(toPx)}`).join(',');
}

// Every range the element holds, not only the furthest end: on this host a seek inside one is instant
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
