import { describe, expect, test } from 'vitest';

import { buildBands, buildPeaks } from '#files.ts';
import { validateWavedata } from '#validate.ts';

type Pair = [min: number, max: number, rms: number];

const soundPair: Pair = [-10, 20, 12];

function peaksOf(pairs: ReadonlyArray<Pair>, sampleRate = 44_100): Uint8Array {
	return buildPeaks(Int8Array.from(pairs.flat()), sampleRate);
}

function bandsOf(frameCount: number, sampleRate = 44_100): Uint8Array {
	return buildBands(new Uint8Array(frameCount * 3), sampleRate);
}

function rewrite(file: Uint8Array, offset: number, value: number): Uint8Array {
	new DataView(file.buffer).setUint32(offset, value, true);

	return file;
}

describe('validateWavedata', () => {
	test('passes peaks alone, and peaks beside bands cut from the same samples', () => {
		const fivePairs = Array.from({ length: 5 }, () => soundPair);

		expect(validateWavedata({ peaks: peaksOf(fivePairs) })).toStrictEqual([]);
		expect(validateWavedata({ bands: bandsOf(2), peaks: peaksOf(fivePairs) })).toStrictEqual([]);
	});

	test('passes any level byte, a zero beside a sounding band included', () => {
		const bands = buildBands(Uint8Array.from([0, 255, 1]), 44_100);

		expect(validateWavedata({ bands, peaks: peaksOf([soundPair]) })).toStrictEqual([]);
	});

	test('reports a file shorter than its header and stops reading it', () => {
		expect(validateWavedata({ peaks: new Uint8Array(23) })).toStrictEqual([
			'Peaks are shorter than their header',
		]);
		expect(
			validateWavedata({ bands: new Uint8Array(35), peaks: peaksOf([soundPair]) }),
		).toStrictEqual(['Band data is shorter than its header']);
	});

	test('reports every header field off its value, in both files at once', () => {
		const peaks = rewrite(rewrite(peaksOf([soundPair]), 0, 2), 20, 7);
		const bands = rewrite(bandsOf(1), 24, 4000);

		expect(validateWavedata({ bands, peaks })).toStrictEqual([
			'Peaks has version 2, expected 1',
			'Peaks has value kind 7, expected 1',
			'Band data has second band edge 4000, expected 2000',
		]);
	});

	test('reports a sample rate of zero and a file that holds nothing', () => {
		expect(validateWavedata({ bands: bandsOf(0, 0), peaks: peaksOf([], 0) })).toStrictEqual([
			'Peaks sample rate is 0',
			'Peaks pair count is 0',
			'Band data sample rate is 0',
			'Band data frame count is 0',
		]);
	});

	test('reports a length that is not the header plus what it counts, short or long', () => {
		const peaks = peaksOf([soundPair, soundPair]);
		const padded = new Uint8Array(31);

		padded.set(peaks);

		expect(validateWavedata({ peaks: peaks.subarray(0, 29) })).toStrictEqual([
			'Peaks length is 29 bytes, expected 30 for 2 pairs',
		]);
		expect(validateWavedata({ peaks: padded })).toStrictEqual([
			'Peaks length is 31 bytes, expected 30 for 2 pairs',
		]);
		expect(
			validateWavedata({ bands: bandsOf(1).subarray(0, 38), peaks: peaksOf([soundPair]) }),
		).toStrictEqual(['Band data length is 38 bytes, expected 39 for 1 frames']);
	});

	test('reports each rule a pair breaks once, with how many break it and the first', () => {
		const problems = validateWavedata({
			peaks: peaksOf([soundPair, [20, -10, 5], [-10, 20, -1], [-10, 20, 21], [30, 10, 40]]),
		});

		expect(problems).toStrictEqual([
			'Peaks have min above max in 2 pairs, the first at pair 1',
			'Peaks have RMS below zero in 1 pairs, the first at pair 2',
			'Peaks have RMS above the larger peak in 2 pairs, the first at pair 3',
		]);
	});

	test('measures the RMS against the larger peak by size, so a pair clamped at -128 passes', () => {
		expect(validateWavedata({ peaks: peaksOf([[-128, -128, 127]]) })).toStrictEqual([]);
		expect(validateWavedata({ peaks: peaksOf([[-32, -32, 32]]) })).toStrictEqual([]);
	});

	test('reports two files cut at different rates', () => {
		expect(
			validateWavedata({ bands: bandsOf(1, 48_000), peaks: peaksOf([soundPair]) }),
		).toStrictEqual(['Peaks sample rate is 44100, band data sample rate is 48000']);
	});

	test('reports a frame count that is not one per four pairs, rounded up', () => {
		const fivePairs = Array.from({ length: 5 }, () => soundPair);

		expect(validateWavedata({ bands: bandsOf(1), peaks: peaksOf(fivePairs) })).toStrictEqual([
			'Band data frame count is 1, expected 2 for 5 pairs',
		]);
		expect(validateWavedata({ bands: bandsOf(3), peaks: peaksOf(fivePairs) })).toStrictEqual([
			'Band data frame count is 3, expected 2 for 5 pairs',
		]);
	});
});
