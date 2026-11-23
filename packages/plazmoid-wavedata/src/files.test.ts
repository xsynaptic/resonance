import { describe, expect, test } from 'vitest';

import { buildBands, buildPeaks, parseBandsHeader, parsePeaksHeader } from '#files.ts';
import { bandsHeaderBytes, peaksHeaderBytes } from '#format.ts';

function rewrite(file: Uint8Array, offset: number, value: number): Uint8Array {
	new DataView(file.buffer).setUint32(offset, value, true);

	return file;
}

describe('buildPeaks', () => {
	test('writes a header its parser reads back, with pair zero right after it', () => {
		const file = buildPeaks(Int8Array.from([-10, 20, 12, -30, 40, 25]), 48_000);

		expect(parsePeaksHeader(file)).toStrictEqual({ pairCount: 2, sampleRate: 48_000 });
		expect([...new Int8Array(file.buffer, file.byteOffset + peaksHeaderBytes, 6)]).toStrictEqual([
			-10, 20, 12, -30, 40, 25,
		]);
	});

	test('takes a view into a larger buffer without reading past it', () => {
		const pool = Uint8Array.from([99, 1, 2, 3, 99]);

		expect([...buildPeaks(pool.subarray(1, 4), 44_100).subarray(peaksHeaderBytes)]).toStrictEqual([
			1, 2, 3,
		]);
	});
});

describe('parsePeaksHeader', () => {
	test('rejects a file cut at another rate or with another layout', () => {
		const resampled = rewrite(buildPeaks(new Int8Array(3), 44_100), 8, 1024);
		const relaid = rewrite(buildPeaks(new Int8Array(3), 44_100), 16, 2);

		expect(() => parsePeaksHeader(resampled)).toThrow(
			'Peaks has samples per pair 1024, expected 256',
		);
		expect(() => parsePeaksHeader(relaid)).toThrow('Peaks has field count 2, expected 3');
	});

	test('rejects a file shorter than its header', () => {
		expect(() => parsePeaksHeader(new Uint8Array(peaksHeaderBytes - 1))).toThrow(
			'Peaks are shorter than their header',
		);
	});

	test('reads a header that starts partway into its buffer', () => {
		const file = buildPeaks(new Int8Array(6), 48_000);
		const shifted = new Uint8Array(file.length + 5);

		shifted.set(file, 5);

		expect(parsePeaksHeader(shifted.subarray(5))).toStrictEqual({
			pairCount: 2,
			sampleRate: 48_000,
		});
	});
});

describe('buildBands', () => {
	test('writes a header its parser reads back, with frame zero right after it', () => {
		const levels = Uint8Array.from([10, 20, 30, 40, 50, 60]);
		const file = buildBands(levels, 48_000);

		expect(parseBandsHeader(file)).toStrictEqual({ frameCount: 2, sampleRate: 48_000 });
		expect([...file.subarray(bandsHeaderBytes)]).toStrictEqual([...levels]);
	});
});

describe('parseBandsHeader', () => {
	test('rejects a file cut with a different frame size', () => {
		const file = rewrite(buildBands(Uint8Array.from([1, 2, 3]), 44_100), 8, 512);

		expect(() => parseBandsHeader(file)).toThrow(
			'Band data has samples per frame 512, expected 1024',
		);
	});

	test('rejects a file shorter than its header', () => {
		expect(() => parseBandsHeader(new Uint8Array(bandsHeaderBytes - 1))).toThrow(
			'Band data is shorter than its header',
		);
	});
});
