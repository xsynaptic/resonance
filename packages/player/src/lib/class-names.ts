export function joinClassNames(...values: ReadonlyArray<string | undefined>): string {
	return values.filter((value) => value !== undefined).join(' ');
}
