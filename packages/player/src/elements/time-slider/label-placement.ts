// Past this share of the width a label opens leftward, ending over its cue point
const openEndFrom = 0.6;

export interface LabelPlacement {
	// From the cue point to the edge its label opens toward
	room: number;
	side: 'end' | 'start';
}

export function labelPlacement(x: number, width: number): LabelPlacement {
	const side = x < width * openEndFrom ? 'start' : 'end';

	return { room: side === 'start' ? width - x : x, side };
}
