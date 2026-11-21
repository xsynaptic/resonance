import { bandsHeaderBytes } from '@xsynaptic/shared/waveform-format';
import { describe, expect, test } from 'vitest';

import { bandMedians, buildBands, parseBandsHeader } from '#audio/bands.ts';

function bandsOf(frames: ReadonlyArray<[number, number, number]>): Buffer {
	return buildBands(Buffer.from(frames.flat()), 44_100);
}

describe('buildBands', () => {
	test('writes a header its parser reads back, with frame zero at the shared offset', () => {
		const levels = Buffer.from([10, 20, 30, 40, 50, 60]);
		const file = buildBands(levels, 48_000);

		expect(parseBandsHeader(file)).toEqual({ frameCount: 2, sampleRate: 48_000 });
		expect([...file.subarray(bandsHeaderBytes)]).toEqual([...levels]);
	});

	test('rejects a file cut with a different frame size', () => {
		const file = buildBands(Buffer.from([1, 2, 3]), 44_100);

		file.writeInt32LE(512, 8);

		expect(() => parseBandsHeader(file)).toThrow('samples per frame 512');
	});

	test('rejects a file shorter than its header', () => {
		expect(() => parseBandsHeader(Buffer.alloc(bandsHeaderBytes - 1))).toThrow('shorter');
	});
});

describe('bandMedians', () => {
	test("takes each band's median over its sounding frames, so a long silence does not drag it down", () => {
		const silence: Array<[number, number, number]> = Array.from({ length: 7 }, () => [0, 0, 0]);

		expect(bandMedians(bandsOf([...silence, [100, 10, 30], [120, 20, 30], [140, 30, 30]]))).toEqual(
			[120, 20, 30],
		);
	});

	test('rejects a file whose levels are shorter than its header claims', () => {
		const file = bandsOf([
			[1, 2, 3],
			[4, 5, 6],
		]);

		expect(() => bandMedians(file.subarray(0, -1))).toThrow(/truncated/);
	});
});
