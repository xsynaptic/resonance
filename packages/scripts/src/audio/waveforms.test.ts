import { describe, expect, test } from 'vitest';

import { distillWaveform, parseWaveformHeader } from '#audio/waveforms.ts';

interface DatOverrides {
	flags?: number;
	sampleRate?: number;
	samplesPerPixel?: number;
	truncateBy?: number;
	version?: number;
}

// Hand-built `.dat` matching the audiowaveform header
// Layout: version, flags, sample_rate, samples_per_pixel, length in PAIRS, then 8-bit min/max pairs
function buildDat(pairs: Array<[number, number]>, overrides: DatOverrides = {}): Buffer {
	const buffer = Buffer.alloc(20 + pairs.length * 2);

	buffer.writeInt32LE(overrides.version ?? 1, 0);
	buffer.writeUInt32LE(overrides.flags ?? 1, 4);
	buffer.writeInt32LE(overrides.sampleRate ?? 44_100, 8);
	buffer.writeInt32LE(overrides.samplesPerPixel ?? 256, 12);
	buffer.writeUInt32LE(pairs.length, 16);

	for (const [index, [min, max]] of pairs.entries()) {
		buffer.writeInt8(min, 20 + index * 2);
		buffer.writeInt8(max, 20 + index * 2 + 1);
	}

	return overrides.truncateBy === undefined
		? buffer
		: buffer.subarray(0, buffer.length - overrides.truncateBy);
}

// Bucket b of an 800-pair file covers exactly pairs [2b, 2b + 2)
function buildTwoPairBuckets(filled: Record<number, [number, number]>): Buffer {
	const pairs: Array<[number, number]> = Array.from({ length: 800 }, () => [0, 0]);

	for (const [bucket, [first, second]] of Object.entries(filled)) {
		pairs[Number(bucket) * 2] = [-first, first];
		pairs[Number(bucket) * 2 + 1] = [-second, second];
	}

	return buildDat(pairs);
}

describe('parseWaveformHeader', () => {
	test('reads the fields the pipeline depends on', () => {
		const header = parseWaveformHeader(buildDat([[-10, 20]]));

		expect(header).toEqual({ pairs: 1, sampleRate: 44_100, samplesPerPixel: 256 });
	});

	test('rejects anything the archive is not', () => {
		expect(() => parseWaveformHeader(buildDat([[0, 0]], { version: 2 }))).toThrow(/version 2/);
		expect(() => parseWaveformHeader(buildDat([[0, 0]], { flags: 0 }))).toThrow(/not 8-bit/);
		expect(() => parseWaveformHeader(buildDat([[0, 0]], { samplesPerPixel: 512 }))).toThrow(
			/512 samples per pixel/,
		);
		expect(() => parseWaveformHeader(Buffer.alloc(12))).toThrow(/shorter than its header/);
	});
});

describe('distillWaveform', () => {
	test('reduces each bucket by RMS of the envelope, not by mean or peak', () => {
		// RMS of (30, 50) is 41.23, which is 0.825 of the loudest bucket; the mean would be 0.8
		const preview = distillWaveform(buildTwoPairBuckets({ 0: [30, 50], 1: [50, 50] }));

		expect(preview.values[0]).toBe(0.825);
		expect(preview.values[1]).toBe(1);
		expect(preview.values[2]).toBe(0);
	});

	test('takes the envelope amplitude from whichever of min and max is larger', () => {
		const preview = distillWaveform(
			buildDat([
				[-80, 10],
				[40, 40],
			]),
		);

		expect(preview.values).toEqual([1, 0.5]);
	});

	test('normalizes per file so the loudest bucket always tops out', () => {
		const quiet = distillWaveform(
			buildDat([
				[-4, 4],
				[-2, 2],
			]),
		);
		const loud = distillWaveform(
			buildDat([
				[-100, 100],
				[-50, 50],
			]),
		);

		expect(quiet.values).toEqual(loud.values);
	});

	test('keeps a short file at its own resolution rather than upsampling', () => {
		const preview = distillWaveform(buildDat(Array.from({ length: 37 }, () => [-10, 10])));

		expect(preview.values).toHaveLength(37);
	});

	test('caps a long file at the preview budget with no empty buckets', () => {
		// 600 pairs across 400 buckets: uneven boundaries, so every bucket must still cover at least one pair
		const preview = distillWaveform(buildDat(Array.from({ length: 600 }, () => [-10, 10])));

		expect(preview.values).toHaveLength(400);
		expect(preview.values.every((value) => value === 1)).toBe(true);
	});

	test('derives duration from the header', () => {
		const preview = distillWaveform(buildDat(Array.from({ length: 4000 }, () => [-10, 10])));

		expect(preview.seconds).toBe(23.2);
		expect(preview.version).toBe(2);
	});

	test('survives digital silence without dividing by zero', () => {
		const preview = distillWaveform(
			buildDat([
				[0, 0],
				[0, 0],
			]),
		);

		expect(preview.values).toEqual([0, 0]);
	});

	test('rejects a file whose data is shorter than its header claims', () => {
		expect(() =>
			distillWaveform(
				buildDat(
					[
						[-10, 10],
						[-10, 10],
					],
					{ truncateBy: 2 },
				),
			),
		).toThrow(/truncated/);
	});
});
