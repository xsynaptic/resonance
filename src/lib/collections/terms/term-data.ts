import type { CollectionEntry } from 'astro:content';

import { getCollection } from 'astro:content';

import type { TermCollectionKey } from '#lib/catalog/catalog-types.ts';

import { termIndexes } from '#lib/collections/terms/term-index.ts';

export interface TermCollection {
	entries: Array<CollectionEntry<TermCollectionKey>>;
	entriesMap: Map<string, CollectionEntry<TermCollectionKey>>;
}

const termCollections = new Map<TermCollectionKey, Promise<TermCollection>>();

export function getTermCollection(collection: TermCollectionKey): Promise<TermCollection> {
	let promise = termCollections.get(collection);

	if (promise === undefined) {
		promise = buildTermCollection(collection);
		termCollections.set(collection, promise);
	}

	return promise;
}

async function buildTermCollection(collection: TermCollectionKey): Promise<TermCollection> {
	const [entries, index] = await Promise.all([
		getCollection(collection),
		termIndexes[collection](),
	]);

	const entriesMap = new Map<string, CollectionEntry<TermCollectionKey>>();

	for (const entry of entries) {
		entry.data._entryCount = index.get(entry.id)?.length ?? 0;
		entriesMap.set(entry.id, entry);
	}

	return { entries, entriesMap };
}
