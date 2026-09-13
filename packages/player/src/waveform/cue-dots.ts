import type { QueueCuePoint } from '#types.ts';

// One empty column between dots on a row; closer than that drops a row
const columnsApart = 2;

// Past this share of the width a label opens leftward, ending over its dot
const openEndFrom = 2 / 3;

export interface CueDot {
	cue: QueueCuePoint;
	// Rows down from the top edge
	lane: number;
	// CSS pixels from the left edge to the centre of a bar column
	left: number;
	// CSS pixels from there to the edge its label opens toward
	room: number;
	side: 'end' | 'start';
}

// The bar grid in CSS pixels, as the dots are positioned by the DOM rather than painted
export interface CueGrid {
	bar: number;
	count: number;
	pitch: number;
	width: number;
}

export function layoutCueDots(
	cuePoints: ReadonlyArray<QueueCuePoint>,
	durationSeconds: number,
	{ bar, count, pitch, width }: CueGrid,
): Array<CueDot> {
	const lastColumns: Array<number> = [];
	const dots: Array<CueDot> = [];

	for (const cue of cuePoints) {
		const column = Math.min(
			count - 1,
			Math.max(0, Math.floor((cue.startSeconds / durationSeconds) * count)),
		);
		const left = column * pitch + bar / 2;
		let lane = lastColumns.findIndex((last) => column - last >= columnsApart);

		if (lane === -1) lane = lastColumns.length;

		lastColumns[lane] = column;

		const side = left < width * openEndFrom ? 'start' : 'end';

		dots.push({ cue, lane, left, room: side === 'start' ? width - left : left, side });
	}

	return dots;
}
