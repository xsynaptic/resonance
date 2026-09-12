import type { ContentEntry } from '#shared/astro-content.ts';

export function makeEntry(
	overrides: Partial<ContentEntry> & Pick<ContentEntry, 'id'>,
): ContentEntry {
	return { collection: 'mixes', data: {}, ...overrides };
}

// Astro `reference()` fields serialize as `{ id, collection }`
export function makeReferences(collection: string, ids: Array<string>) {
	return ids.map((id) => ({ collection, id }));
}
