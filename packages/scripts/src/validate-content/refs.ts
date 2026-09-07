import type { ContentEntry } from '#shared/astro-content.ts';

import { getIdsByCollection, toReferenceIds } from '#shared/entries.ts';
import { toValidationResult } from '#validate-content/validation-result.ts';

// Every schema carrying these is `.strict()`, so a field name here cannot mean anything else
// The extractor emits both forms: `{ id }` where the name resolved to a term, a bare string where not
const topLevelRefFields = {
	artists: 'artists',
	labels: 'labels',
	members: 'artists',
	projects: 'artists',
} as const;

const nestedRefFields = {
	selections: { artists: 'artists', labels: 'labels' },
	tracks: { artists: 'artists', labels: 'labels', mixArtists: 'artists' },
} as const;

interface EntryRef {
	collection: string;
	field: string;
	id: string;
}

interface RefIssue extends EntryRef {
	location: string;
}

// A ref that carries an id but resolves to nothing only `console.warn`s at build, so it ships
export function collectRefIssues(entries: Array<ContentEntry>, catalog: Array<ContentEntry>) {
	const idsByCollection = getIdsByCollection(catalog);

	return entries.flatMap((entry) => collectEntryRefIssues(entry, idsByCollection));
}

export function validateRefs(entries: Array<ContentEntry>, catalog: Array<ContentEntry>) {
	const issues = collectRefIssues(entries, catalog);

	return toValidationResult(
		issues.map(({ collection, field, id, location }) => ({
			message: `${location}: ${field} references "${id}", missing from "${collection}"`,
		})),
		{
			fail: `Found ${issues.length.toString()} unresolved ref(s)`,
			pass: 'Artist and label refs valid',
		},
	);
}

function collectContainerRefs(items: unknown, container: string, fields: Record<string, string>) {
	if (!Array.isArray(items)) return [];

	const values: Array<unknown> = items;

	const refs: Array<EntryRef> = [];

	for (const [index, item] of values.entries()) {
		if (item === null || typeof item !== 'object') continue;

		const record = item as Record<string, unknown>;
		const prefix = `${container}[${index.toString()}].`;

		// A grouped tracklist nests its tracks one level down, so the path reads `tracks[0].tracks[3].labels`
		if (Array.isArray(record.tracks)) {
			refs.push(...collectContainerRefs(record.tracks, `${prefix}tracks`, fields));
			continue;
		}

		refs.push(...collectFieldRefs(record, fields, prefix));
	}

	return refs;
}

function collectEntryRefIssues(entry: ContentEntry, idsByCollection: Map<string, Set<string>>) {
	const issues: Array<RefIssue> = [];

	for (const ref of collectEntryRefs(entry)) {
		if (idsByCollection.get(ref.collection)?.has(ref.id)) continue;

		issues.push({ ...ref, location: entry.filePath ?? entry.id });
	}

	return issues;
}

function collectEntryRefs(entry: ContentEntry) {
	const refs = collectFieldRefs(entry.data, topLevelRefFields, '');

	for (const [container, fields] of Object.entries(nestedRefFields)) {
		refs.push(...collectContainerRefs(entry.data[container], container, fields));
	}

	return refs;
}

function collectFieldRefs(
	source: Record<string, unknown>,
	fields: Record<string, string>,
	prefix: string,
) {
	const refs: Array<EntryRef> = [];

	for (const [field, collection] of Object.entries(fields)) {
		const ids = toReferenceIds(source[field]);

		refs.push(...ids.map((id) => ({ collection, field: `${prefix}${field}`, id })));
	}

	return refs;
}
