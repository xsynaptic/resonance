import { describe, expect, test } from 'vitest';

import { validateStationItems } from '#validate-content/station-items.ts';
import { makeEntry } from '#validate-content/validate-test-utils.ts';

const mixes = [
	makeEntry({ data: { files: ['voyager.mp3'] }, id: 'voyager' }),
	makeEntry({ data: { files: [] }, id: 'silent' }),
	makeEntry({ collection: 'reviews', data: { files: ['a-review.mp3'] }, id: 'a-review' }),
];

describe('validateStationItems', () => {
	test('passes when every item is a mix with files', () => {
		const stations = [
			makeEntry({ collection: 'stations', data: { stationItems: ['voyager'] }, id: 'psytrance' }),
		];

		expect(validateStationItems(stations, mixes.slice(0, 2)).status).toBe('pass');
	});

	test('fails on an unknown id and a mix with no files, naming each', () => {
		const stations = [
			makeEntry({
				collection: 'stations',
				data: { stationItems: ['voyager', 'silent', 'gone'] },
				id: 'psytrance',
			}),
		];

		expect(validateStationItems(stations, mixes.slice(0, 2))).toEqual({
			issues: [
				{ message: 'station "psytrance": "silent" is not a mix with audio files' },
				{ message: 'station "psytrance": "gone" is not a mix with audio files' },
			],
			status: 'fail',
			summary: 'Found 2 unplayable station item(s)',
		});
	});
});
