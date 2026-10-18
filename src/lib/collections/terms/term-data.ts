import type { CollectionEntry } from 'astro:content';

import type { TermCollectionKey } from '#lib/catalog/catalog-types.ts';

import { termIndexes } from '#lib/collections/terms/term-index.ts';
import { createCollectionData } from '#lib/utils/collections.ts';

function createTermCollectionData<K extends TermCollectionKey>(collection: K) {
	return createCollectionData({
		collection,
		async compute() {
			const index = await termIndexes[collection]();

			return function computeTerm(entry: CollectionEntry<K>) {
				return { _entryCount: index.get(entry.id)?.length ?? 0 };
			};
		},
	});
}

export const termCollectionData = {
	artists: createTermCollectionData('artists'),
	eras: createTermCollectionData('eras'),
	labels: createTermCollectionData('labels'),
	regions: createTermCollectionData('regions'),
	series: createTermCollectionData('series'),
	styles: createTermCollectionData('styles'),
	themes: createTermCollectionData('themes'),
};

export function getTermCollection(collection: TermCollectionKey) {
	return termCollectionData[collection]();
}
