// Rows are measured once at drag start, so the count of midpoints the pointer has passed is the landing index
export function dropIndex(
	midpoints: ReadonlyArray<number>,
	from: number,
	pointerY: number,
): number {
	let crossed = 0;

	for (const midpoint of midpoints) {
		if (pointerY > midpoint) crossed += 1;
	}

	// The dragged row is one of the rows counted once the pointer is below it
	return from < crossed ? crossed - 1 : crossed;
}
