import type { StreamSource } from '#types.ts';

interface PickedSource {
	isTypeDeclined: boolean;
	source: StreamSource;
}

export function pickSource(
	sources: ReadonlyArray<StreamSource>,
	canPlay: (type: string) => boolean,
): PickedSource | undefined {
	const [first] = sources;
	if (first === undefined) return undefined;

	for (const source of sources) {
		if (source.type === undefined || canPlay(source.type)) {
			return { isTypeDeclined: false, source };
		}
	}

	return { isTypeDeclined: true, source: first };
}
