import type { CollectionEntry, CollectionKey } from 'astro:content';

import { getCollection } from 'astro:content';

// A selection's `entryId` names an entry by bare slug (cross-collection); resolve in priority order
const linkableCollections = ['mixes', 'reviews', 'posts'] as const satisfies Array<CollectionKey>;

export type LinkableEntry = CollectionEntry<(typeof linkableCollections)[number]>;

let slugMapPromise: Promise<Map<string, LinkableEntry>> | undefined;

export async function getEntryBySlug(slug: string): Promise<LinkableEntry | undefined> {
	const slugMap = await getSlugMap();
	const entry = slugMap.get(slug);

	if (!entry) {
		console.warn(`[entries] slug "${slug}" not found in ${linkableCollections.join(', ')}`);
		return undefined;
	}

	return entry;
}

async function buildSlugMap(): Promise<Map<string, LinkableEntry>> {
	const slugMap = new Map<string, LinkableEntry>();

	for (const collection of linkableCollections) {
		const entries = await getCollection(collection);

		for (const entry of entries) {
			if (!slugMap.has(entry.id)) slugMap.set(entry.id, entry);
		}
	}

	return slugMap;
}

async function getSlugMap(): Promise<Map<string, LinkableEntry>> {
	if (!slugMapPromise) slugMapPromise = buildSlugMap();
	return slugMapPromise;
}
