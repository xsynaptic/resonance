export function canMove(length: number, from: number, to: number): boolean {
	if (from === to) return false;
	if (from < 0 || from >= length) return false;

	return to >= 0 && to < length;
}

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

export function movedArray<T>(items: ReadonlyArray<T>, from: number, to: number): Array<T> {
	const next = [...items];
	const [moved] = next.splice(from, 1);
	if (moved === undefined) return next;

	next.splice(to, 0, moved);

	return next;
}

export function movedIndex(index: number, from: number, to: number): number {
	if (index === from) return to;
	if (from < index && index <= to) return index - 1;
	if (to <= index && index < from) return index + 1;

	return index;
}
