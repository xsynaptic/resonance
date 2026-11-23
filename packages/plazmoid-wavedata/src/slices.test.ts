import { describe, expect, test } from 'vitest';

import { framesByteRange, pairsByteRange, splitPairs } from '#slices.ts';

const peaks = { byteOffset: 24, pairCount: 20_000 };
const bands = { bandCount: 3, byteOffset: 36, frameCount: 4096 };

describe('pairsByteRange', () => {
	test('gives the half-open byte span of a run of pairs, past the header', () => {
		expect(pairsByteRange(peaks, 0, 8192)).toStrictEqual([24, 24_600]);
		expect(pairsByteRange(peaks, 8192, 16_384)).toStrictEqual([24_600, 49_176]);
	});

	test('clamps a span that runs past either end of the data', () => {
		expect(pairsByteRange(peaks, 16_384, 24_576)).toStrictEqual([49_176, 60_024]);
		expect(pairsByteRange(peaks, -5, 1)).toStrictEqual([24, 27]);
	});

	test('gives nothing for a span that holds no pair', () => {
		expect(pairsByteRange(peaks, 20_000, 28_192)).toBeUndefined();
		expect(pairsByteRange(peaks, 10, 10)).toBeUndefined();
		expect(pairsByteRange(peaks, 12, 10)).toBeUndefined();
	});
});

describe('framesByteRange', () => {
	test('gives the half-open byte span of a run of frames, past the header', () => {
		expect(framesByteRange(bands, 2048, 4096)).toStrictEqual([6180, 12_324]);
	});

	test('gives nothing for a span that starts where the frames end', () => {
		expect(framesByteRange(bands, 4096, 6144)).toBeUndefined();
	});
});

describe('splitPairs', () => {
	test('writes min and max interleaved and one RMS per pair, from the pair it is told', () => {
		const target = { rms: new Int8Array(4), samples: new Int8Array(8) };
		const source = Uint8Array.from([255, 206, 60, 20, 128, 127, 100]);

		splitPairs(source.subarray(1), target, 1);

		expect([...target.samples]).toStrictEqual([0, 0, -50, 60, -128, 127, 0, 0]);
		expect([...target.rms]).toStrictEqual([0, 20, 100, 0]);
	});

	test('drops a trailing part of a pair', () => {
		const target = { rms: new Int8Array(2), samples: new Int8Array(4) };

		splitPairs(Uint8Array.from([1, 2, 3, 4, 5]), target, 0);

		expect([...target.samples]).toStrictEqual([1, 2, 0, 0]);
		expect([...target.rms]).toStrictEqual([3, 0]);
	});
});
