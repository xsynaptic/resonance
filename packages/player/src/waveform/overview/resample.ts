import { bucketBounds } from '#lib/bucket-bounds.ts';

// The renderer picks its bar count from the box, not from the manifest, so the peaks are resampled to fit
export function resamplePeaks(peaks: ReadonlyArray<number>, count: number): ReadonlyArray<number> {
	if (count <= 0 || peaks.length === 0) return [];
	if (count === peaks.length) return peaks;
	if (count > peaks.length) return upsample(peaks, count);

	return renormalise(downsample(peaks, count));
}

// The data is an RMS envelope, so a mean over the covered buckets keeps its shape where a max would flatten it
function downsample(peaks: ReadonlyArray<number>, count: number): Array<number> {
	const resampled: Array<number> = [];

	for (let index = 0; index < count; index += 1) {
		const { end, start } = bucketBounds(peaks.length, index, count);

		let total = 0;

		for (let source = start; source < end; source += 1) {
			total += peaks[source] ?? 0;
		}

		resampled.push(total / (end - start));
	}

	return resampled;
}

// Averaging pulls every bar down, so a quiet mix would sit in the bottom of its box without this
function renormalise(peaks: Array<number>): Array<number> {
	const loudest = Math.max(...peaks);
	if (loudest <= 0) return peaks;

	return peaks.map((peak) => peak / loudest);
}

function upsample(peaks: ReadonlyArray<number>, count: number): Array<number> {
	const resampled: Array<number> = [];
	const lastSource = peaks.length - 1;

	for (let index = 0; index < count; index += 1) {
		const position = count === 1 ? 0 : (index * lastSource) / (count - 1);
		const before = Math.floor(position);
		const after = Math.min(lastSource, before + 1);
		const weight = position - before;

		resampled.push((peaks[before] ?? 0) * (1 - weight) + (peaks[after] ?? 0) * weight);
	}

	return resampled;
}
