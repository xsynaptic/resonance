import type { CollectionEntry, CollectionKey } from 'astro:content';

import { getCollection } from 'astro:content';
import { performance } from 'node:perf_hooks';
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
	label?: string;
}): () => Promise<CollectionResult<ComputedCollectionEntry<K, C>>> {
	const getData = pMemoize(async () => {
		const startTime = performance.now();

		const rawEntries = await getCollection(config.collection);
		const computeEntry = await config.compute(rawEntries);

		// TS cannot resolve a spread over the generic entry union back to the computed shape
		const entries = rawEntries.map((entry) => ({
			...entry,
			data: { ...entry.data, ...computeEntry(entry) },
		})) as Array<ComputedCollectionEntry<K, C>>;

		const entriesMap = new Map(entries.map((entry) => [entry.id, entry]));

		console.log(
			`[${config.label ?? config.collection}] Collection data generated in ${(performance.now() - startTime).toFixed(4)}ms`,
		);

		return { entries, entriesMap };
	});

	// Astro's data store can load empty in dev; memoizing that strands it for the whole session
	return async function () {
		const result = await getData();

		if (import.meta.env.DEV && result.entries.length === 0) {
			pMemoizeClear(getData);
		}

		return result;
	};
}
