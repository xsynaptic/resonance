import { peaksHeaderBytes } from '@xsynaptic/shared/waveform-format';
import { describe, expect, test } from 'vitest';

import { buildPeaks, parsePeaksHeader } from '#audio/peaks.ts';

describe('buildPeaks', () => {
	test('writes a header its parser reads back, with pair zero at the shared offset', () => {
		const values = Int8Array.from([-10, 20, 12, -30, 40, 25]);
		const fields = Buffer.from(values.buffer, values.byteOffset, values.byteLength);
		const file = buildPeaks(fields, 48_000);

		expect(parsePeaksHeader(file)).toEqual({ pairCount: 2, sampleRate: 48_000 });
		expect([...new Int8Array(file.subarray(peaksHeaderBytes))]).toEqual([-10, 20, 12, -30, 40, 25]);
	});

	test('rejects a file cut at another rate or with another layout', () => {
		const resampled = buildPeaks(Buffer.alloc(3), 44_100);
		const relaid = buildPeaks(Buffer.alloc(3), 44_100);

		resampled.writeUInt32LE(1024, 8);
		relaid.writeUInt32LE(2, 16);

		expect(() => parsePeaksHeader(resampled)).toThrow('samples per pair 1024');
		expect(() => parsePeaksHeader(relaid)).toThrow('field count 2');
	});

	test('rejects a file shorter than its header', () => {
		expect(() => parsePeaksHeader(Buffer.alloc(peaksHeaderBytes - 1))).toThrow('shorter');
	});
});
