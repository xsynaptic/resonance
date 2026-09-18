import type { QueueCuePoint } from '#types.ts';

// One empty column between cue points on a row; closer than that pushes the cue to the next row
const columnsApart = 2;

// Past this share of the width a label opens leftward, ending over its cue point
const openEndFrom = 0.6;

export interface BarGrid {
	bar: number;
	count: number;
	pitch: number;
	ratio: number;
	width: number;
}

export interface CuePointGrid extends BarGrid {
	size: number;
}

// In device pixels, off the grid the bars are painted on
export interface PlacedCuePoint {
	cuePoint: QueueCuePoint;
	// Rows down from the top edge
	lane: number;
	// From the centre to the edge its label opens toward
	room: number;
	side: 'end' | 'start';
	x: number;
	y: number;
}

// -1 until the first timestamp, where a mix indexed from part way in begins
export function cueIndexAt(cuePoints: ReadonlyArray<QueueCuePoint>, seconds: number): number {
	let found = -1;

	for (const [index, cue] of cuePoints.entries()) {
		if (cue.startSeconds > seconds) break;

		found = index;
	}

	return found;
}

export function cuePointAt(
	placed: ReadonlyArray<PlacedCuePoint>,
	{ x, y }: { x: number; y: number },
	hitRadius: number,
): PlacedCuePoint | undefined {
	let nearest: PlacedCuePoint | undefined;
	let nearestDistance = hitRadius * hitRadius;

	for (const cuePoint of placed) {
		const distance = (cuePoint.x - x) ** 2 + (cuePoint.y - y) ** 2;
		if (distance > nearestDistance) continue;

		nearest = cuePoint;
		nearestDistance = distance;
	}

	return nearest;
}

export function labelPlacement(x: number, width: number): Pick<PlacedCuePoint, 'room' | 'side'> {
	const side = x < width * openEndFrom ? 'start' : 'end';

	return { room: side === 'start' ? width - x : x, side };
}

export function layoutCuePoints(
	cuePoints: ReadonlyArray<QueueCuePoint>,
	durationSeconds: number,
	{ bar, count, pitch, size, width }: CuePointGrid,
): Array<PlacedCuePoint> {
	const laneStep = size + pitch - bar;
	const lastColumns: Array<number> = [];
	const placed: Array<PlacedCuePoint> = [];

	for (const cuePoint of cuePoints) {
		const column = Math.min(
			count - 1,
			Math.max(0, Math.floor((cuePoint.startSeconds / durationSeconds) * count)),
		);
		const x = column * pitch + bar / 2;
		let lane = lastColumns.findIndex((last) => column - last >= columnsApart);

		if (lane === -1) lane = lastColumns.length;

		lastColumns[lane] = column;

		placed.push({
			cuePoint,
			lane,
			...labelPlacement(x, width),
			x,
			y: size / 2 + lane * laneStep,
		});
	}

	return placed;
}

export function placedCueAt(
	placed: ReadonlyArray<PlacedCuePoint>,
	seconds: number,
): PlacedCuePoint | undefined {
	return placed.findLast((point) => point.cuePoint.startSeconds <= seconds);
}
