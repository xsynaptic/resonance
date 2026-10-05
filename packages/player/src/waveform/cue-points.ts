import type { QueueCuePoint } from '#types.ts';

// Past this share of the width a label opens leftward, ending over its cue point
const openEndFrom = 0.6;

export interface LabelPlacement {
	// From the cue point to the edge its label opens toward
	room: number;
	side: 'end' | 'start';
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

export function labelPlacement(x: number, width: number): LabelPlacement {
	const side = x < width * openEndFrom ? 'start' : 'end';

	return { room: side === 'start' ? width - x : x, side };
}
