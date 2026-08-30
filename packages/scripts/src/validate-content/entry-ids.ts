import type { DataStoreEntry } from '../shared/data-store.js';

import { toValidationResult } from './validation-result.js';

interface DuplicateIdIssue {
	id: string;
	locations: Array<string>;
}

// Ids are flat across `<Link id>` and the site root, so a duplicate silently wins by load order
export function collectDuplicateIdIssues(entries: Array<DataStoreEntry>) {
	const locationsById = new Map<string, Array<string>>();

	for (const entry of entries) {
		const location = entry.filePath ?? entry.id;
		const claimed = locationsById.get(entry.id);

		if (claimed) {
			claimed.push(location);
			continue;
		}

		locationsById.set(entry.id, [location]);
	}

	const issues: Array<DuplicateIdIssue> = [];

	for (const [id, locations] of locationsById) {
		if (locations.length > 1) issues.push({ id, locations });
	}

	return issues;
}

export function validateEntryIds(entries: Array<DataStoreEntry>) {
	const issues = collectDuplicateIdIssues(entries);

	return toValidationResult(
		issues.map(({ id, locations }) => ({
			details: locations,
			message: `duplicate entry ID "${id}"`,
		})),
		{
			fail: `Found ${issues.length.toString()} duplicate entry ID(s)`,
			pass: `${entries.length.toString()} entry IDs unique`,
		},
	);
}
