import type { DataStoreCollections, DataStoreEntry } from '../shared/data-store.js';

import { toReferenceIds } from '../shared/data-store.js';
import { toValidationResult } from './validation-result.js';

// Every schema carrying these is `.strict()`, so a field name here cannot mean anything else
// The extractor emits bare strings only, so every `{ id }` in the tree is hand-written
const topLevelRefFields = {
	artists: 'artists',
	labels: 'labels',
	members: 'artists',
	projects: 'artists',
} as const;

const nestedRefFields = {
	selections: { artist: 'artists', labels: 'labels' },
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
export function collectRefIssues(
	entries: Array<DataStoreEntry>,
	collections: DataStoreCollections,
) {
	return entries.flatMap((entry) => collectEntryRefIssues(entry, collections));
}

export function validateRefs(entries: Array<DataStoreEntry>, collections: DataStoreCollections) {
	const issues = collectRefIssues(entries, collections);

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

		refs.push(
			...collectFieldRefs(
				item as Record<string, unknown>,
				fields,
				`${container}[${index.toString()}].`,
			),
		);
	}

	return refs;
}

function collectEntryRefIssues(entry: DataStoreEntry, collections: DataStoreCollections) {
	const issues: Array<RefIssue> = [];

	for (const ref of collectEntryRefs(entry)) {
		const target = collections.get(ref.collection);

		if (!target) throw new Error(`Unknown collection: "${ref.collection}"`);
		if (target.has(ref.id)) continue;

		issues.push({ ...ref, location: entry.filePath ?? entry.id });
	}

	return issues;
}

function collectEntryRefs(entry: DataStoreEntry) {
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
