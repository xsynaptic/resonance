import { describe, expect, test } from 'vitest';

import { resamplePeaks } from '#waveform/overview/resample.ts';

// Means and interpolation both leave float noise the shape of the answer does not depend on
function rounded(peaks: ReadonlyArray<number>): Array<number> {
	return peaks.map((peak) => Math.round(peak * 1000) / 1000);
}

describe('resamplePeaks', () => {
	test('averages the buckets each bar covers when downsampling', () => {
		// Pairs average to 0.3, 0.7 and 1, and 1 is already the loudest, so renormalising changes nothing
		expect(rounded(resamplePeaks([0.2, 0.4, 0.6, 0.8, 1, 1], 3))).toStrictEqual([0.3, 0.7, 1]);
	});

	test('renormalises so the loudest bar fills the box', () => {
		// Pairs average to 0.2 and 0.1, neither of which would reach the top of the box unscaled
		expect(rounded(resamplePeaks([0.1, 0.3, 0.1, 0.1], 2))).toStrictEqual([1, 0.5]);
	});

	test('leaves silence alone rather than dividing by zero', () => {
		expect(resamplePeaks([0, 0, 0, 0], 2)).toStrictEqual([0, 0]);
	});

	test('interpolates between the buckets when upsampling', () => {
		expect(rounded(resamplePeaks([0, 1], 3))).toStrictEqual([0, 0.5, 1]);
		expect(rounded(resamplePeaks([0, 0.4, 0.8], 5))).toStrictEqual([0, 0.2, 0.4, 0.6, 0.8]);
	});

	test('answers with nothing when there is nothing to draw', () => {
		expect(resamplePeaks([], 10)).toStrictEqual([]);
		expect(resamplePeaks([0.5], 0)).toStrictEqual([]);
	});
});
