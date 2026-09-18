import { describe, expect, test } from 'vitest';

import type { TrackValue } from '#lib/schemas/audio.ts';

import { toFlatTracks, toTrackGroups } from '#lib/utils/track-groups.ts';

const one: TrackValue = { artists: 'Lorn', title: 'All Directions Are the Same' };
const two: TrackValue = { artists: 'O Yuki Conjugate', title: 'Black Magic Box' };

describe('toTrackGroups', () => {
	test('wraps a flat list in one untitled group', () => {
		expect(toTrackGroups([one, two])).toEqual([{ tracks: [one, two] }]);
	});

	test('returns no groups for an empty list or nothing at all', () => {
		expect(toTrackGroups([])).toEqual([]);
		expect(toTrackGroups(undefined)).toEqual([]);
	});
});

describe('toFlatTracks', () => {
	test('flattens groups in order', () => {
		expect(
			toFlatTracks([
				{ title: 'Disc One', tracks: [one] },
				{ title: 'Disc Two', tracks: [two] },
			]),
		).toEqual([one, two]);
	});
});
