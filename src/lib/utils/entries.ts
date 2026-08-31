import type { CollectionEntry, CollectionKey } from 'astro:content';

import { getCollection } from 'astro:content';

import type { ResolvedRef } from '#lib/utils/terms.ts';

// A selection's `entryId` names an entry by bare slug (cross-collection); resolve in priority order
const linkableCollections = ['mixes', 'reviews', 'posts'] as const satisfies Array<CollectionKey>;

export type LinkableEntry = CollectionEntry<(typeof linkableCollections)[number]>;

let slugMapPromise: Promise<Map<string, LinkableEntry>> | undefined;

interface ReleaseTitle {
	artist?: ResolvedRef;
	title: string;
}

export async function getEntryBySlug(slug: string): Promise<LinkableEntry | undefined> {
	const slugMap = await getSlugMap();
	const entry = slugMap.get(slug);

	if (!entry) {
		console.warn(`[entries] slug "${slug}" not found in ${linkableCollections.join(', ')}`);
		return undefined;
	}

	return entry;
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

async function buildSlugMap(): Promise<Map<string, LinkableEntry>> {
	const slugMap = new Map<string, LinkableEntry>();

	for (const collection of linkableCollections) {
		const entries = await getCollection(collection);

		for (const entry of entries) {
			if (!slugMap.has(entry.id)) slugMap.set(entry.id, entry);
		}
	}

	return slugMap;
}

async function getSlugMap(): Promise<Map<string, LinkableEntry>> {
	if (!slugMapPromise) slugMapPromise = buildSlugMap();
	return slugMapPromise;
}
