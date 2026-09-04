import type { ContentEntry } from '../shared/astro-content.js';

import { toValidationResult } from './validation-result.js';

interface DuplicateIdIssue {
	id: string;
	locations: Array<string>;
}

// Ids are flat across `<Link id>` and the site root; the catalog throws on a duplicate mid-build
export function collectDuplicateIdIssues(entries: Array<ContentEntry>) {
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

export function validateEntryIds(entries: Array<ContentEntry>) {
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
