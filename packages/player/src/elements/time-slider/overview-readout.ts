import type { QueueCuePoint } from '#types.ts';
import type { PlacedCuePoint } from '#waveform/cue-points.ts';
import type { WaveformRendering } from '#waveform/overview/overview-render.ts';

import { cuePointAtPointer } from '#elements/time-slider/overview-scrub.ts';
import { labelPlacement, placedCueAt } from '#waveform/cue-points.ts';

// Where the label is anchored, in device pixels; `seconds` is absent where nothing maps a pixel to a time
export interface OverviewReadout {
	cuePoint: QueueCuePoint | undefined;
	room: number;
	seconds: number | undefined;
	side: 'end' | 'start';
	x: number;
	y: number;
}

interface ReadoutTarget {
	durationSeconds: number | undefined;
	rect: DOMRect;
	rendering: undefined | WaveformRendering;
}

export function isSameReadout(
	shown: OverviewReadout | undefined,
	next: OverviewReadout | undefined,
): boolean {
	if (shown === undefined || next === undefined) return shown === next;

	return (
		shown.cuePoint === next.cuePoint &&
		shown.x === next.x &&
		Math.floor(shown.seconds ?? 0) === Math.floor(next.seconds ?? 0)
	);
}

export function readoutAtPointer(
	{ durationSeconds, rect, rendering }: ReadoutTarget,
	pointer: { clientX: number; clientY: number },
): OverviewReadout | undefined {
	if (rendering === undefined || rect.width === 0) return undefined;

	const placed = cuePointAtPointer(rendering, rect, pointer);

	if (durationSeconds === undefined) return markerReadout(placed);

	// A press over a marker snaps to its start, so the readout says where the click lands rather than where the pointer is
	if (placed !== undefined)
		return coveringReadout(rendering, placed.cuePoint.startSeconds, placed.x);

	const ratio = Math.min(1, Math.max(0, (pointer.clientX - rect.left) / rect.width));

	return coveringReadout(rendering, ratio * durationSeconds, Math.round(ratio * rendering.width));
}

// The Track covering the instant, and the row its marker sits on; the first row where no Track has started
function coveringReadout(
	rendering: WaveformRendering,
	seconds: number,
	x: number,
): OverviewReadout {
	const covering = placedCueAt(rendering.cuePoints, seconds);

	return {
		cuePoint: covering?.cuePoint,
		...labelPlacement(x, rendering.width),
		seconds,
		x,
		y: covering?.y ?? rendering.cuePointSize / 2,
	};
}

// Without a duration nothing maps a pixel to a time, so the inert preview keeps the marker label it has always shown
function markerReadout(placed: PlacedCuePoint | undefined): OverviewReadout | undefined {
	if (placed === undefined) return undefined;

	const { cuePoint, room, side, x, y } = placed;

	return { cuePoint, room, seconds: undefined, side, x, y };
}
