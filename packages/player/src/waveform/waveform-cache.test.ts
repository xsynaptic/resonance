import { describe, expect, test } from 'vitest';
import WaveformData from 'waveform-data';

import { resamplePeaks } from '#waveform/waveform-cache.ts';

// Four 8-bit mono pixels with peaks 10, 64, 128 and 5 against a full scale of 128
function fixtureWaveform(): WaveformData {
	return WaveformData.create({
		bits: 8,
		channels: 1,
		data: [-10, 10, -64, 64, -128, 127, -5, 5],
		length: 4,
		sample_rate: 48_000,
		samples_per_pixel: 512,
		version: 2,
	});
}

describe('resamplePeaks', () => {
	test('normalizes each pixel to 0..1 against full scale', () => {
		const peaks = resamplePeaks(fixtureWaveform(), 4);

		expect(peaks[0]).toBeCloseTo(10 / 128, 5);
		expect(peaks[1]).toBeCloseTo(64 / 128, 5);
		expect(peaks[2]).toBeCloseTo(1, 5);
		expect(peaks[3]).toBeCloseTo(5 / 128, 5);
	});

	test('downsamples by taking the max peak per bucket', () => {
		const peaks = resamplePeaks(fixtureWaveform(), 2);

		expect(peaks).toHaveLength(2);
		expect(peaks[0]).toBeCloseTo(64 / 128, 5);
		expect(peaks[1]).toBeCloseTo(1, 5);
	});
});
