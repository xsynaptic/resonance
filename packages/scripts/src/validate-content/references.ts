import type { ContentEntry } from '#shared/astro-content.ts';
import type { EntryReference, ReferenceIssue } from '#validate-content/validation-result.ts';

import { getIdsByCollection } from '#shared/entries.ts';
import { toReferenceValidationResult } from '#validate-content/validation-result.ts';

// Astro checks references itself but only logs, leaving a broken reference to ship
// The declared collection matters; a `reference('regions')` naming an era passes a flat lookup
export function collectReferenceIssues(entries: Array<ContentEntry>) {
	const idsByCollection = getIdsByCollection(entries);

	return entries.flatMap((entry) => getEntryReferenceIssues(entry, idsByCollection));
}

export function validateReferences(entries: Array<ContentEntry>) {
	const issues = collectReferenceIssues(entries);

	return toReferenceValidationResult(issues, {
		fail: `Found ${issues.length.toString()} broken reference(s)`,
		pass: 'Entry references valid',
	});
}

// Walking for the `{ id, collection }` shape avoids a hand-maintained list of reference fields
// The polymorphic artist and label credits carry no `collection`, so they fall through to `credits.ts`
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

function getEntryReferenceIssues(entry: ContentEntry, idsByCollection: Map<string, Set<string>>) {
	const references: Array<EntryReference> = [];

	collectEntryReferences(entry.data, '', references);

	const issues: Array<ReferenceIssue> = [];

	for (const reference of references) {
		const ids = idsByCollection.get(reference.collection);

		// References into collections outside this check's scope are left alone
		if (!ids || ids.has(reference.id)) continue;

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
