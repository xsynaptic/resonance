import { buildPeaks } from '@xsynaptic/plazmoid-wavedata';
import { describe, expect, test } from 'vitest';

import { distillWaveform } from '#audio/waveforms.ts';

type Pair = [min: number, max: number, rms: number];

function peaksOf(pairs: ReadonlyArray<Pair>, truncateBy = 0): Uint8Array {
	const file = buildPeaks(Int8Array.from(pairs.flat()), 44_100);

	return file.subarray(0, file.length - truncateBy);
}

function quiet(rms: number): Pair {
	return [-100, 100, rms];
}

// Bucket b of an 800-pair file covers exactly pairs [2b, 2b + 2)
function twoPairBuckets(filled: Record<number, [number, number]>): Uint8Array {
	const pairs: Array<Pair> = Array.from({ length: 800 }, () => [0, 0, 0]);

	for (const [bucket, [first, second]] of Object.entries(filled)) {
		pairs[Number(bucket) * 2] = quiet(first);
		pairs[Number(bucket) * 2 + 1] = quiet(second);
	}

	return peaksOf(pairs);
}

describe('distillWaveform', () => {
	test('reduces each bucket by the RMS of its pairs, not by their mean or peak', () => {
		// RMS of (30, 50) is 41.23, which is 0.825 of the loudest bucket, byte 210; the mean would be 0.8, byte 204
		const overview = distillWaveform(twoPairBuckets({ 0: [30, 50], 1: [50, 50] }));

		expect(overview.values[0]).toBe(210);
		expect(overview.values[1]).toBe(255);
		expect(overview.values[2]).toBe(0);
	});

	test('reads the body, so a bucket that peaks as high but is quieter draws lower', () => {
		const overview = distillWaveform(peaksOf([quiet(80), quiet(40)]));

		expect([...overview.values]).toEqual([255, 128]);
	});

	test('keeps a short file at its own resolution rather than upsampling', () => {
		const overview = distillWaveform(peaksOf(Array.from({ length: 37 }, () => quiet(10))));

		expect(overview.values).toHaveLength(37);
	});

	test('caps a long file at the overview budget', () => {
		const overview = distillWaveform(peaksOf(Array.from({ length: 600 }, () => quiet(10))));

		expect(overview.values).toHaveLength(400);
		expect(overview.values.every((value) => value === 255)).toBe(true);
	});

	test('derives duration from the header', () => {
		const overview = distillWaveform(peaksOf(Array.from({ length: 4000 }, () => quiet(10))));

		expect(overview.seconds).toBe(23.2);
	});

	test('survives digital silence without dividing by zero', () => {
		const overview = distillWaveform(
			peaksOf([
				[0, 0, 0],
				[0, 0, 0],
			]),
		);

		expect([...overview.values]).toEqual([0, 0]);
	});

	test('rejects a file whose data is shorter than its header claims', () => {
		expect(() => distillWaveform(peaksOf([quiet(10), quiet(10)], 3))).toThrow(/truncated/);
	});
});
