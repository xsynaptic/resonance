import type { DataStoreCollections, DataStoreEntry } from '../shared/data-store.js';

import { toValidationResult } from './validation-result.js';

interface EntryReference {
	collection: string;
	field: string;
	id: string;
}

interface ReferenceIssue extends EntryReference {
	location: string;
}

// Astro checks references itself but only logs, leaving a broken reference to ship
// The declared collection matters; a `reference('regions')` naming an era passes a flat lookup
export function collectReferenceIssues(
	collections: DataStoreCollections,
	collectionNames: Array<string>,
) {
	const entriesByCollection = getEntriesByCollection(collections, collectionNames);

	const issues: Array<ReferenceIssue> = [];

	for (const collection of entriesByCollection.values()) {
		for (const entry of collection.values()) {
			issues.push(...getEntryReferenceIssues(entry, entriesByCollection));
		}
	}

	return issues;
}

export function validateReferences(
	collections: DataStoreCollections,
	collectionNames: Array<string>,
) {
	const issues = collectReferenceIssues(collections, collectionNames);

	return toValidationResult(
		issues.map(({ collection, field, id, location }) => ({
			message: `${location}: ${field} references "${id}", missing from "${collection}"`,
		})),
		{
			fail: `Found ${issues.length.toString()} broken reference(s)`,
			pass: 'Entry references valid',
		},
	);
}

// Walking for the `{ id, collection }` shape avoids a hand-maintained list of reference fields
// The polymorphic artist and label refs carry no `collection`, so they fall through to `refs.ts`
function collectEntryReferences(value: unknown, field: string, references: Array<EntryReference>) {
	if (value === null || typeof value !== 'object') return;

	if (Array.isArray(value)) {
		for (const [index, item] of value.entries()) {
			collectEntryReferences(item, `${field}[${index.toString()}]`, references);
		}
		return;
	}

	const record = value as Record<string, unknown>;
	const reference = toEntryReference(record, field);

	if (reference) {
		references.push(reference);
		return;
	}

	for (const [key, item] of Object.entries(record)) {
		collectEntryReferences(item, field ? `${field}.${key}` : key, references);
	}
}

function getEntriesByCollection(collections: DataStoreCollections, collectionNames: Array<string>) {
	const entriesByCollection = new Map<string, Map<string, DataStoreEntry>>();

	for (const name of collectionNames) {
		const collection = collections.get(name);

		if (!collection) throw new Error(`Unknown collection: "${name}"`);

		entriesByCollection.set(name, collection);
	}

	return entriesByCollection;
}

function getEntryReferenceIssues(
	entry: DataStoreEntry,
	entriesByCollection: Map<string, Map<string, DataStoreEntry>>,
) {
	const references: Array<EntryReference> = [];

	collectEntryReferences(entry.data, '', references);

	const issues: Array<ReferenceIssue> = [];

	for (const reference of references) {
		const target = entriesByCollection.get(reference.collection);

		// References into collections outside this check's scope are left alone
		if (!target || target.has(reference.id)) continue;

		issues.push({ location: entry.filePath ?? entry.id, ...reference });
	}

	return issues;
}

function toEntryReference(
	record: Record<string, unknown>,
	field: string,
): EntryReference | undefined {
	if (typeof record.collection !== 'string' || typeof record.id !== 'string') return undefined;

	return { collection: record.collection, field, id: record.id };
}
