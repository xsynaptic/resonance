export type HeaderField = [name: string, offset: number, value: number];

// Any field off its expected value reads as a stale file, which the next run regenerates
export function assertHeaderFields(
	buffer: Buffer,
	label: string,
	fields: ReadonlyArray<HeaderField>,
): void {
	for (const [name, offset, value] of fields) {
		const found = buffer.readUInt32LE(offset);

		if (found !== value) {
			throw new Error(`${label} has ${name} ${String(found)}, expected ${String(value)}`);
		}
	}
}
