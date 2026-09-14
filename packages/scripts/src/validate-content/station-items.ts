import type { ContentEntry } from '#shared/astro-content.ts';

import { toValidationResult } from '#validate-content/validation-result.ts';

export function validateStationItems(stations: Array<ContentEntry>, mixes: Array<ContentEntry>) {
	const playableIds = new Set(
		mixes
			.filter((entry) => Array.isArray(entry.data.files) && entry.data.files.length > 0)
			.map((entry) => entry.id),
	);

	const issues: Array<{ id: string; station: string }> = [];

	for (const station of stations) {
		const stationItems = station.data.stationItems as Array<string> | undefined;

		if (!stationItems) continue;

		for (const id of stationItems) {
			if (!playableIds.has(id)) issues.push({ id, station: station.id });
		}
	}

	return toValidationResult(
		issues.map(({ id, station }) => ({
			message: `station "${station}": "${id}" is not a mix with audio files`,
		})),
		{
			fail: `Found ${issues.length.toString()} unplayable station item(s)`,
			pass: 'Station items valid',
		},
	);
}
