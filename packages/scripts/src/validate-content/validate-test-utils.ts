import type { DataStoreCollections, DataStoreEntry } from '../shared/data-store.js';

export function makeCollections(entriesByCollection: Record<string, Array<DataStoreEntry>>) {
	const collections: DataStoreCollections = new Map();

	for (const [name, entries] of Object.entries(entriesByCollection)) {
		collections.set(name, new Map(entries.map((entry) => [entry.id, entry])));
	}

	return collections;
}

export function makeEntry(
	overrides: Partial<DataStoreEntry> & Pick<DataStoreEntry, 'id'>,
): DataStoreEntry {
	return { data: {}, ...overrides };
}

// Astro `reference()` fields serialize as `{ id, collection }`
export function makeRefs(collection: string, ids: Array<string>) {
	return ids.map((id) => ({ collection, id }));
}
