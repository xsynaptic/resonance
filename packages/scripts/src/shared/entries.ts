// The domain helpers that outlived the hand-rolled data store reader; pure, so anything may import them
import type { ContentEntry } from '#shared/astro-content.ts';

// Which ids exist per collection, for checking that a reference resolves where it says it does
export function getIdsByCollection(entries: Array<Pick<ContentEntry, 'collection' | 'id'>>) {
	const idsByCollection = new Map<string, Set<string>>();

	for (const entry of entries) {
		const ids = idsByCollection.get(entry.collection) ?? new Set<string>();

		ids.add(entry.id);
		idsByCollection.set(entry.collection, ids);
	}

	return idsByCollection;
}

// The schema rejects a mixed array, so the first element settles the shape for all of them
export function isGroupedTracklist(values: Array<unknown>): boolean {
	const [first] = values;

	return first !== null && typeof first === 'object' && 'tracks' in first;
}

// Old slugs the entry still answers to, which `generate-redirects` turns into rules
export function toFormerIds(entry: { data: Record<string, unknown> }): Array<string> {
	const formerIds: unknown = entry.data.formerIds;

	if (!Array.isArray(formerIds)) return [];

	return (formerIds as Array<unknown>).filter(
		(value): value is string => typeof value === 'string',
	);
}

// Free text in the polymorphic artist and label credits is a bare string, carrying no id to collect
// A scalar is accepted alongside an array because a track's `artists` is written either way
export function toReferenceIds(value: unknown): Array<string> {
	const values: Array<unknown> = Array.isArray(value) ? (value as Array<unknown>) : [value];

	const ids: Array<string> = [];

	for (const item of values) {
		if (item === null || typeof item !== 'object') continue;

		const { id } = item as { id?: unknown };

		if (typeof id === 'string') ids.push(id);
	}

	return ids;
}
