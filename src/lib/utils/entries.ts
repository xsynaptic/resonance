import type { CollectionEntry, CollectionKey } from 'astro:content';

import { getCollection } from 'astro:content';

import type { LinkedName } from '#lib/utils/terms.ts';

const titleSeparator = ' - ';

// A selection's `entryId` names an entry by bare slug (cross-collection); resolve in priority order
const linkableCollections = ['mixes', 'reviews', 'posts'] as const satisfies Array<CollectionKey>;

export type LinkableEntry = CollectionEntry<(typeof linkableCollections)[number]>;

let slugMapPromise: Promise<Map<string, LinkableEntry>> | undefined;

interface ReleaseTitle {
	artist?: LinkedName;
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

// Reviews carry the full "Artist - Release" title plus a bare releaseTitle
// Callers with no resolved artist credits still need the test, so it lives apart from the split
export function matchReleaseTitle(title: string, releaseTitle: string | undefined) {
	return releaseTitle !== undefined && title.endsWith(`${titleSeparator}${releaseTitle}`)
		? releaseTitle
		: undefined;
}

// The prefix links only when it matches a resolved artist credit exactly; anything else renders unsplit
export function splitReleaseTitle(
	title: string,
	releaseTitle: string | undefined,
	artists: Array<LinkedName>,
): ReleaseTitle {
	const work = matchReleaseTitle(title, releaseTitle);

	if (work === undefined) return { title };

	const artistName = title.slice(0, -(titleSeparator.length + work.length));
	const artist = artists.find((candidate) => candidate.name === artistName);

	if (!artist) return { title };

	return { artist, title: work };
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
