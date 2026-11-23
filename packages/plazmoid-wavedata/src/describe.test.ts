import { describe, expect, test } from 'vitest';

import { describeWavedata } from '#describe.ts';
import { buildBands, buildPeaks } from '#files.ts';
import { formatVersion } from '#format.ts';

type Pair = [min: number, max: number, rms: number];
type Frame = [low: number, mid: number, high: number];

const silentPair: Pair = [0, 0, 0];

function peaksOf(pairs: ReadonlyArray<Pair>): Uint8Array {
	return buildPeaks(Int8Array.from(pairs.flat()), 44_100);
}

function bandsOf(frames: ReadonlyArray<Frame>): Uint8Array {
	return buildBands(Uint8Array.from(frames.flat()), 44_100);
}

function quiet(rms: number): Pair {
	return [-100, 100, rms];
}

describe('describeWavedata', () => {
	test('reads the quiet and loud levels by nearest rank over the sounding pairs only', () => {
		const sounding = Array.from({ length: 20 }, (_pair, index) => quiet(index + 1));
		const silent = Array.from({ length: 30 }, () => silentPair);

		expect(describeWavedata({ peaks: peaksOf([...silent, ...sounding]) }).rmsRange).toStrictEqual([
			2, 19,
		]);
	});

	test('gives a range of zeros for digital silence', () => {
		expect(describeWavedata({ peaks: peaksOf([silentPair, silentPair]) }).rmsRange).toStrictEqual([
			0, 0,
		]);
	});

	test("takes each band's median over its sounding frames, so a long silence does not drag it down", () => {
		const silence = Array.from({ length: 7 }, (): Frame => [0, 0, 0]);
		const bands = bandsOf([...silence, [100, 10, 30], [120, 20, 30], [140, 30, 30]]);

		expect(describeWavedata({ bands, peaks: peaksOf([silentPair]) }).bands.medians).toStrictEqual([
			120, 20, 30,
		]);
	});

	test('gives a median of zero to a band that never sounds', () => {
		const bands = bandsOf([
			[50, 0, 0],
			[70, 0, 0],
		]);

		expect(describeWavedata({ bands, peaks: peaksOf([silentPair]) }).bands.medians).toStrictEqual([
			50, 0, 0,
		]);
	});

	test('takes the rates from each header, at one pair per 256 samples and one frame per 1,024', () => {
		const facts = describeWavedata({
			bands: buildBands(new Uint8Array(3), 48_000),
			peaks: buildPeaks(new Int8Array(12), 48_000),
		});

		expect(facts).toMatchObject({
			bands: {
				bandCount: 3,
				byteOffset: 36,
				frameCount: 1,
				framesPerSecond: 46.875,
				minDecibels: -60,
			},
			byteOffset: 24,
			pairCount: 4,
			pairsPerSecond: 187.5,
		});
	});

	test("stamps the package's format version, with and without bands", () => {
		const peaks = peaksOf([silentPair]);

		expect(describeWavedata({ peaks }).formatVersion).toBe(formatVersion);
		expect(describeWavedata({ bands: bandsOf([[0, 0, 0]]), peaks }).formatVersion).toBe(
			formatVersion,
		);
	});

	test('leaves the bands out when only peaks are given', () => {
		expect(describeWavedata({ peaks: peaksOf([silentPair]) })).not.toHaveProperty('bands');
	});

	test('rejects a file whose data is shorter than its header claims', () => {
		const peaks = peaksOf([quiet(10), quiet(10)]);
		const bands = bandsOf([
			[1, 2, 3],
			[4, 5, 6],
		]);

		expect(() => describeWavedata({ peaks: peaks.subarray(0, -3) })).toThrow('Peaks are truncated');
		expect(() => describeWavedata({ bands: bands.subarray(0, -1), peaks })).toThrow(
			'Band data is truncated',
		);
	});
});
