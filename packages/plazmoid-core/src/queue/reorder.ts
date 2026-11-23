export function canMove(length: number, from: number, to: number): boolean {
	if (from === to) return false;
	if (from < 0 || from >= length) return false;

	return to >= 0 && to < length;
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
