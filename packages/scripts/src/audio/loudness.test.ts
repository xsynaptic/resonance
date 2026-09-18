import { describe, expect, test } from 'vitest';

import { parseEbur128 } from '#audio/loudness.ts';

// Captured from ffmpeg 9.0.1 with ebur128=peak=true:framelog=verbose
function summary(integrated: string, truePeak: string): string {
	return `[Parsed_ebur128_1 @ 0x9d3008f00] Summary:

  Integrated loudness:
    I:         ${integrated} LUFS
    Threshold: -40.9 LUFS

  Loudness range:
    LRA:        11.3 LU
    Threshold: -53.9 LUFS
    LRA low:   -40.2 LUFS
    LRA high:  -28.9 LUFS

  True peak:
    Peak:      ${truePeak} dBFS
[out#0/null @ 0x9d3008600] video:0KiB audio:938KiB subtitle:0KiB other streams:0KiB global headers:0KiB muxing overhead: unknown
size=N/A time=00:00:05.00 bitrate=N/A speed= 156x elapsed=0:00:00.03`;
}

describe('parseEbur128', () => {
	test('reads integrated loudness and a true peak above full scale', () => {
		expect(parseEbur128(summary('-9.8', '2.7'))).toEqual({
			integratedLufs: -9.8,
			truePeakDbtp: 2.7,
		});
	});

	test('reads the last summary when the input carried an earlier one', () => {
		const stderr = `${summary('-30.0', '-6.0')}\n${summary('-14.6', '-1.9')}`;

		expect(parseEbur128(stderr)).toEqual({ integratedLufs: -14.6, truePeakDbtp: -1.9 });
	});

	test('reads digital silence as negative infinity rather than NaN', () => {
		expect(parseEbur128(summary('-70.0', '-inf')).truePeakDbtp).toBe(-Infinity);
	});
});
