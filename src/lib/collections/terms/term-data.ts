import type { CollectionEntry } from 'astro:content';

import { getCollection } from 'astro:content';

import type { TermCollectionKey } from '#lib/catalog/catalog-types.ts';
import type { TermIndex } from '#lib/collections/terms/term-index.ts';

import {
	getArtistAppearancesIndex,
	getLabelAppearancesIndex,
} from '#lib/collections/terms/appearances-index.ts';
import { termIndexes } from '#lib/collections/terms/term-index.ts';
import { memoizeByKey } from '#lib/utils/memoize.ts';

interface TermCollection {
	entries: Array<CollectionEntry<TermCollectionKey>>;
	entriesMap: Map<string, CollectionEntry<TermCollectionKey>>;
}

// Only Artists and Labels index credits named in passing; the rest leave `_appearanceCount` unset
const appearanceIndexes: Partial<Record<TermCollectionKey, () => Promise<TermIndex>>> = {
	artists: getArtistAppearancesIndex,
	labels: getLabelAppearancesIndex,
};

export const getTermCollection = memoizeByKey(buildTermCollection);

async function buildTermCollection(collection: TermCollectionKey): Promise<TermCollection> {
	const getAppearances = appearanceIndexes[collection];

	const [entries, index, appearances] = await Promise.all([
		getCollection(collection),
		termIndexes[collection](),
		getAppearances?.(),
	]);

	const entriesMap = new Map<string, CollectionEntry<TermCollectionKey>>();

	for (const entry of entries) {
		entry.data._entryCount = index.get(entry.id)?.length ?? 0;
		if (appearances) entry.data._appearanceCount = appearances.get(entry.id)?.length ?? 0;
		entriesMap.set(entry.id, entry);
	}

	return { entries, entriesMap };
}
