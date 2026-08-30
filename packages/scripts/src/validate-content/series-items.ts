import type { DataStoreEntry } from '../shared/data-store.js';

import { toValidationResult } from './validation-result.js';

// Plain strings rather than references, because a series spans collections
// An unresolved item is dropped from the index behind a DEV-only warning, so it is silent in CI
export function validateSeriesItems(
	entries: Array<DataStoreEntry>,
	validTargets: Array<DataStoreEntry>,
) {
	const validIds = new Set(validTargets.map((entry) => entry.id));

	const issues: Array<{ id: string; location: string }> = [];

	for (const entry of entries) {
		const seriesItems = entry.data.seriesItems as Array<string> | undefined;

		if (!seriesItems) continue;

		for (const id of seriesItems) {
			if (!validIds.has(id)) issues.push({ id, location: entry.filePath ?? entry.id });
		}
	}

	return toValidationResult(
		issues.map(({ id, location }) => ({ message: `${location}: unknown series item "${id}"` })),
		{
			fail: `Found ${issues.length.toString()} unknown series item(s)`,
			pass: 'Series items valid',
		},
	);
}
