import type { ContentEntry } from '#shared/astro-content.ts';
import type { ReferenceIssue } from '#validate-content/validation-result.ts';

import { getIdsByCollection, toReferenceIds } from '#shared/entries.ts';
import { toReferenceValidationResult } from '#validate-content/validation-result.ts';

interface CreditField {
	collection: string;
	field: string;
	value: unknown;
}

// Every schema carrying these is `.strict()`, so a field name here cannot mean anything else
// The extractor emits both forms: `{ id }` where the name resolved to a term, a bare string where not
const topLevelCreditFields = {
	artists: 'artists',
	labels: 'labels',
	members: 'artists',
	projects: 'artists',
} as const;

const nestedCreditFields = {
	selections: { artists: 'artists', labels: 'labels' },
	tracks: { artists: 'artists', labels: 'labels', mixArtists: 'artists' },
} as const;

// A credit that carries an id but resolves to nothing only `console.warn`s at build, so it ships
export function collectCreditIssues(entries: Array<ContentEntry>, catalog: Array<ContentEntry>) {
	const idsByCollection = getIdsByCollection(catalog);

	return entries.flatMap((entry) => collectEntryCreditIssues(entry, idsByCollection));
}

export function validateCredits(entries: Array<ContentEntry>, catalog: Array<ContentEntry>) {
	const issues = collectCreditIssues(entries, catalog);

	return toReferenceValidationResult(issues, {
		fail: `Found ${issues.length.toString()} unresolved credit(s)`,
		pass: 'Artist and label credits valid',
	});
}

export function collectEntryCredits(entry: ContentEntry) {
	const credits = collectFieldCredits(entry.data, topLevelCreditFields, '');

	for (const [container, fields] of Object.entries(nestedCreditFields)) {
		credits.push(...collectContainerCredits(entry.data[container], container, fields));
	}

	return credits;
}

function collectContainerCredits(
	items: unknown,
	container: string,
	fields: Record<string, string>,
) {
	if (!Array.isArray(items)) return [];

	const values: Array<unknown> = items;

	const credits: Array<CreditField> = [];

	for (const [index, item] of values.entries()) {
		if (item === null || typeof item !== 'object') continue;

		const record = item as Record<string, unknown>;
		const prefix = `${container}[${index.toString()}].`;

		// A grouped tracklist nests its tracks one level down, so the path reads `tracks[0].tracks[3].labels`
		if (Array.isArray(record.tracks)) {
			credits.push(...collectContainerCredits(record.tracks, `${prefix}tracks`, fields));
			continue;
		}

		credits.push(...collectFieldCredits(record, fields, prefix));
	}

	return credits;
}

function collectEntryCreditIssues(entry: ContentEntry, idsByCollection: Map<string, Set<string>>) {
	const issues: Array<ReferenceIssue> = [];

	for (const { collection, field, value } of collectEntryCredits(entry)) {
		for (const id of toReferenceIds(value)) {
			if (idsByCollection.get(collection)?.has(id)) continue;

			issues.push({ collection, field, id, location: entry.filePath ?? entry.id });
		}
	}

	return issues;
}

function collectFieldCredits(
	source: Record<string, unknown>,
	fields: Record<string, string>,
	prefix: string,
): Array<CreditField> {
	return Object.entries(fields).map(([field, collection]) => ({
		collection,
		field: `${prefix}${field}`,
		value: source[field],
	}));
}
