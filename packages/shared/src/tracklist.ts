// The schema rejects a mixed array, so the first element settles the shape for all of them
export function isGroupedTracklist<Group extends { tracks: unknown }>(
	values: ReadonlyArray<unknown>,
): values is Array<Group> {
	const [first] = values;

	return typeof first === 'object' && first !== null && 'tracks' in first;
}
