import type { CollectionEntry, CollectionKey } from 'astro:content';

import type { LinkedName } from '#lib/utils/terms.ts';

import { resolveCredits, resolveTermLinks } from '#lib/utils/terms.ts';

const titleSeparator = ' - ';

export type WorkEntry = CollectionEntry<'mixes' | 'reviews'>;

export interface WorkTitle {
	credit?: LinkedName;
	title: string;
}

export async function getWorkTitle(entry: WorkEntry): Promise<WorkTitle> {
	if (entry.collection === 'mixes') {
		const [credit] = await resolveTermLinks(
			'artists',
			entry.data.alias ? [entry.data.alias] : undefined,
		);

		return credit ? { credit, title: entry.data.title } : { title: entry.data.title };
	}

	const { releaseTitle, title } = entry.data;

	if (releaseTitle === undefined) return { title };

	const suffix = `${titleSeparator}${releaseTitle}`;

	if (!title.endsWith(suffix)) return { title };

	// A Credit is never part of a Release title, so an uncataloged prefix still splits off, unlinked
	const creditName = title.slice(0, -suffix.length);
	const artists = await resolveCredits('artists', entry.data.artists);
	const credit = artists.find((artist) => artist.name === creditName) ?? { name: creditName };

	return { credit, title: releaseTitle };
}

export function isWorkEntry(entry: CollectionEntry<CollectionKey>): entry is WorkEntry {
	return entry.collection === 'mixes' || entry.collection === 'reviews';
}
