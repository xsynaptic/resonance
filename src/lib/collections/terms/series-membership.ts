import type { CollectionEntry } from 'astro:content';

import { getCollection } from 'astro:content';

import type { ContentCatalogItem } from '#lib/catalog/catalog-types.ts';

import { getSeriesIndex } from '#lib/collections/terms/term-index.ts';

export interface SeriesMembership {
	items: Array<ContentCatalogItem>;
	term: CollectionEntry<'series'>;
}

let membershipPromise: Promise<Map<string, Array<SeriesMembership>>> | undefined;

export async function getSeriesMembership(id: string): Promise<Array<SeriesMembership>> {
	if (!membershipPromise) membershipPromise = buildSeriesMembership();

	const membership = await membershipPromise;

	return membership.get(id) ?? [];
}

// The index runs series to members; an entry page needs the other direction
async function buildSeriesMembership(): Promise<Map<string, Array<SeriesMembership>>> {
	const [index, series] = await Promise.all([getSeriesIndex(), getCollection('series')]);

	const termsById = new Map(series.map((entry) => [entry.id, entry] as const));
	const membership = new Map<string, Array<SeriesMembership>>();

	for (const [seriesId, items] of index) {
		const term = termsById.get(seriesId);

		if (!term || items.length === 0) continue;

		for (const item of items) {
			const list = membership.get(item.id) ?? [];

			list.push({ items, term });
			membership.set(item.id, list);
		}
	}

	return membership;
}
