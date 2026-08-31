import type { CollectionEntry } from 'astro:content';

import { getCollection } from 'astro:content';

import type { ContentItem } from '#lib/catalog/catalog-data.ts';

import { toContentItem } from '#lib/catalog/catalog-data.ts';

// Three screens of a 4-up carousel; enough to scroll before the scoring is worth refining
const RELATED_LIMIT = 12;

type ReleaseEntry = CollectionEntry<'mixes' | 'reviews'>;

// Entries with no overlap are dropped rather than padded with recency, so "Related" stays honest
// Returns Catalog Items so the scoring can be replaced without touching the carousel
export async function getRelatedItems(entry: ReleaseEntry): Promise<Array<ContentItem>> {
	const styleIds = new Set((entry.data.styles ?? []).map((style) => style.id));

	if (styleIds.size === 0) return [];

	const entries = await getCollection(entry.collection);

	const related = entries
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
		.slice(0, RELATED_LIMIT);

	return Promise.all(related.map((scored) => toContentItem(entry.collection, scored.candidate)));
}
