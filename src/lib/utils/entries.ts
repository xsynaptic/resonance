import type { CollectionKey } from 'astro:content';

import { getCollection } from 'astro:content';

import type { TermLink } from '#lib/utils/terms.ts';

import { getContentUrl } from '#lib/utils/routing.ts';

// Lists associate entries by bare slug (cross-collection), so resolve against these in priority order
const listPostCollections = [
	'mixes',
	'reviews',
	'posts',
	'designs',
] as const satisfies Array<CollectionKey>;

interface SlugMatch {
	collection: CollectionKey;
	title: string;
}

let slugMapPromise: Promise<Map<string, SlugMatch>> | undefined;

export async function resolveSlugLink(slug: string): Promise<TermLink | undefined> {
	const slugMap = await getSlugMap();
	const match = slugMap.get(slug);

	if (!match) {
		if (import.meta.env.DEV) {
			console.warn(`[lists] slug "${slug}" not found in ${listPostCollections.join(', ')}`);
		}
		return undefined;
	}

	return { title: match.title, url: getContentUrl(match.collection, slug) };
}

async function buildSlugMap(): Promise<Map<string, SlugMatch>> {
	const slugMap = new Map<string, SlugMatch>();

	for (const collection of listPostCollections) {
		const entries = await getCollection(collection);

		for (const entry of entries) {
			if (!slugMap.has(entry.id)) {
				slugMap.set(entry.id, { collection, title: entry.data.title });
			}
		}
	}

	return slugMap;
}

async function getSlugMap(): Promise<Map<string, SlugMatch>> {
	slugMapPromise ??= buildSlugMap();
	return slugMapPromise;
}
