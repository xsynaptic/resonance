import { describe, expect, test } from 'vitest';

import { normalizationGain, playbackGain } from '#engine/playback-gain.ts';

describe('playbackGain', () => {
	test('boosts a quiet track toward the target when the peak has headroom', () => {
		expect(playbackGain({ integratedLufs: -22, truePeakDbtp: -10 })).toBeCloseTo(
			10 ** (6 / 20),
			10,
		);
	});

	test('caps the boost at the true-peak ceiling instead of the target', () => {
		expect(playbackGain({ integratedLufs: -22, truePeakDbtp: -3 })).toBeCloseTo(10 ** (2 / 20), 10);
	});

	test('attenuates a hot track down to the target', () => {
		expect(playbackGain({ integratedLufs: -10, truePeakDbtp: -4 })).toBeCloseTo(
			10 ** (-6 / 20),
			10,
		);
	});

	test('attenuates further when the peak is already over the ceiling', () => {
		expect(playbackGain({ integratedLufs: -14, truePeakDbtp: 2 })).toBeCloseTo(10 ** (-3 / 20), 10);
	});

	test('is unity at the target and exactly on the ceiling', () => {
		expect(playbackGain({ integratedLufs: -16, truePeakDbtp: -1 })).toBeCloseTo(1, 10);
	});

	test('plays unmeasured sources at unity', () => {
		expect(playbackGain({ truePeakDbtp: -3 })).toBe(1);
		expect(playbackGain({ integratedLufs: -12 })).toBe(1);
		expect(playbackGain({})).toBe(1);
	});
});

describe('normalizationGain', () => {
	const item = {
		albumLoudness: { integratedLufs: -22, truePeakDbtp: -10 },
		loudness: { integratedLufs: -19, truePeakDbtp: -10 },
	} as Parameters<typeof normalizationGain>[0];

	test('reads the album columns in queue order', () => {
		expect(normalizationGain(item, false)).toBeCloseTo(10 ** (6 / 20), 10);
	});

	test('reads the per-track columns under shuffle', () => {
		expect(normalizationGain(item, true)).toBeCloseTo(10 ** (3 / 20), 10);
	});
});
