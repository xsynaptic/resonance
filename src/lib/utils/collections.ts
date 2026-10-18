import type { CollectionEntry, CollectionKey } from 'astro:content';

import { getCollection } from 'astro:content';
import pMemoize, { pMemoizeClear } from 'p-memoize';

interface CollectionResult<E extends { id: string }> {
	entries: Array<E>;
	entriesMap: Map<string, E>;
}

type CollectionComputeFunction<K extends CollectionKey, C extends object> = (
	entries: Array<CollectionEntry<K>>,
) => ((entry: CollectionEntry<K>) => C) | Promise<(entry: CollectionEntry<K>) => C>;

type ComputedCollectionEntry<K extends CollectionKey, C extends object> = Omit<
	CollectionEntry<K>,
	'data'
> & {
	data: C & Omit<CollectionEntry<K>['data'], keyof C>;
};

export function createCollectionData<K extends CollectionKey, C extends object>(config: {
	collection: K;
	compute: CollectionComputeFunction<K, C>;
}): () => Promise<CollectionResult<ComputedCollectionEntry<K, C>>> {
	const getData = pMemoize(async () => {
		const rawEntries = await getCollection(config.collection);
		const computeEntry = await config.compute(rawEntries);

		const entries = rawEntries.map((entry) => ({
			...entry,
			data: { ...entry.data, ...computeEntry(entry) },
		})) as Array<ComputedCollectionEntry<K, C>>;

		const entriesMap = new Map(entries.map((entry) => [entry.id, entry]));

		return { entries, entriesMap };
	});

	return async function () {
		const result = await getData();

		if (import.meta.env.DEV && result.entries.length === 0) {
			pMemoizeClear(getData);
		}

		return result;
	};
}
