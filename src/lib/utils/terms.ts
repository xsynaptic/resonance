import type { CollectionKey, ReferenceDataEntry } from 'astro:content';

import { getEntries } from 'astro:content';

import { getContentUrl } from '#lib/utils/routing.ts';

export interface TermLink {
	title: string;
	url: string;
}

// Resolve a collection's reference array into linkable {title, url} pairs (all collections carry `title`)
export async function resolveTermLinks(
	collection: CollectionKey,
	refs: Array<ReferenceDataEntry<CollectionKey>> | undefined,
): Promise<Array<TermLink>> {
	if (!refs || refs.length === 0) return [];

	const entries = await getEntries(refs);

	return entries.map((entry) => ({
		title: entry.data.title,
		url: getContentUrl(collection, entry.id),
	}));
}
