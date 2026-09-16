// One source sample at minimum, so a bucket with nothing mapped to it still reads something
export function bucketBounds(sourceLength: number, index: number, count: number) {
	const start = Math.floor((index * sourceLength) / count);

	return { end: Math.max(start + 1, Math.floor(((index + 1) * sourceLength) / count)), start };
}
