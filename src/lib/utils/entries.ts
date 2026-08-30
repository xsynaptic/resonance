import type { CollectionKey } from 'astro:content';

import { getCollection } from 'astro:content';

import type { ResolvedRef, TermLink } from '#lib/utils/terms.ts';

import { getContentUrl } from '#lib/utils/routing.ts';

// A list item's `linkId` names an entry by bare slug (cross-collection); resolve in priority order
const linkableCollections = ['mixes', 'reviews', 'posts'] as const satisfies Array<CollectionKey>;

interface SlugMatch {
	collection: CollectionKey;
	title: string;
}

let slugMapPromise: Promise<Map<string, SlugMatch>> | undefined;

interface ReleaseTitle {
	artist?: ResolvedRef;
	title: string;
}

export async function resolveSlugLink(slug: string): Promise<TermLink | undefined> {
	const slugMap = await getSlugMap();
	const match = slugMap.get(slug);

	if (!match) {
		if (import.meta.env.DEV) {
			console.warn(`[list-item] slug "${slug}" not found in ${linkableCollections.join(', ')}`);
		}
		return undefined;
	}

	return { title: match.title, url: getContentUrl(match.collection, slug) };
}

// Reviews carry the full "Artist - Release" title plus a bare releaseTitle, so the artist half can link
// The prefix links only when it matches a resolved artist ref exactly; anything else renders unsplit
export function splitReleaseTitle(
	title: string,
	releaseTitle: string | undefined,
	artists: Array<ResolvedRef>,
): ReleaseTitle {
	if (releaseTitle === undefined) return { title };

	const suffix = ` - ${releaseTitle}`;
	if (!title.endsWith(suffix)) return { title };

	const artist = artists.find((ref) => ref.label === title.slice(0, -suffix.length));
	if (!artist) return { title };

	return { artist, title: releaseTitle };
}

async function buildSlugMap(): Promise<Map<string, SlugMatch>> {
	const slugMap = new Map<string, SlugMatch>();

	for (const collection of linkableCollections) {
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
	if (!slugMapPromise) slugMapPromise = buildSlugMap();
	return slugMapPromise;
}
