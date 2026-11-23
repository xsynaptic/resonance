import type { PeaksDescriptor } from '@xsynaptic/plazmoid-wavedata';

import { formatVersion } from '@xsynaptic/plazmoid-wavedata';
import { describe, expect, test } from 'vitest';

import { knownPeaks } from '#waveform/known-peaks.ts';

const peaks: PeaksDescriptor = {
	byteOffset: 24,
	formatVersion,
	pairCount: 20_000,
	pairsPerSecond: 100,
	rmsRange: [4, 40],
	url: 'https://api.test/a.peaks.bin',
};

describe('knownPeaks', () => {
	test("passes a descriptor of the package's own format version through", () => {
		expect(knownPeaks({ peaks })).toBe(peaks);
	});

	test('withholds a descriptor from a newer writer, keeping nothing of it', () => {
		expect(knownPeaks({ peaks: { ...peaks, formatVersion: formatVersion + 1 } })).toBeUndefined();
	});

	test('has nothing for a detail without peaks, or no detail', () => {
		expect(knownPeaks({ waveformOverview: 'M/+ZAA==' })).toBeUndefined();
		expect(knownPeaks(undefined)).toBeUndefined();
	});
});
