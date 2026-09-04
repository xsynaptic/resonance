import type { CollectionEntry } from 'astro:content';

import { getCollection } from 'astro:content';

import type { ContentCatalogItem } from '#lib/catalog/catalog-types.ts';

import { getCatalog } from '#lib/catalog/catalog-data.ts';

// Three screens of a 4-up carousel; enough to scroll before the scoring is worth refining
const relatedLimit = 12;

type ReleaseEntry = CollectionEntry<'mixes' | 'reviews'>;

// Entries with no overlap are dropped rather than padded with recency, so "Related" stays honest
export async function getRelatedItems(entry: ReleaseEntry): Promise<Array<ContentCatalogItem>> {
	const styleIds = new Set((entry.data.styles ?? []).map((style) => style.id));

	if (styleIds.size === 0) return [];

	const [catalog, entries] = await Promise.all([getCatalog(), getCollection(entry.collection)]);

	const itemsById = new Map(
		catalog.byCollection(entry.collection).map((item) => [item.id, item] as const),
	);

	return entries
		.filter((candidate) => candidate.id !== entry.id)
		.map((candidate) => ({
			candidate,
			score: (candidate.data.styles ?? []).filter((style) => styleIds.has(style.id)).length,
		}))
		.filter((scored) => scored.score > 0)
		.sort(
			(first, second) =>
				second.score - first.score ||
				second.candidate.data.dateCreated.getTime() - first.candidate.data.dateCreated.getTime(),
		)
		.slice(0, relatedLimit)
		.map((scored) => itemsById.get(scored.candidate.id))
		.filter((item) => item !== undefined);
}
