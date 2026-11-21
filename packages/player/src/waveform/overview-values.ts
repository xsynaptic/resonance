const fullScale = 255;

// `undefined` where the text is not base64, so a stale or damaged Overview draws a plain groove
export function decodeOverview(encoded: string): Float32Array | undefined {
	try {
		const bytes = atob(encoded);

		return Float32Array.from(bytes, (byte) => (byte.codePointAt(0) ?? 0) / fullScale);
	} catch {
		return undefined;
	}
}
