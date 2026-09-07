import type { CollectionEntry } from 'astro:content';

import type { Thing } from '#lib/utils/seo-structured-data.ts';
import type { ResolvedRef } from '#lib/utils/terms.ts';

import {
	buildArticleSchema,
	buildEntryGraph,
	buildPlaylistSchema,
} from '#lib/utils/seo-structured-data.ts';
import { toFlatTracks } from '#lib/utils/track-groups.ts';

// No `track` array; `track-list.astro` already renders the tracks as an <ol>
export function getMixSchemas(
	entry: CollectionEntry<'mixes'>,
	props: {
		description: string | undefined;
		imageUrl: string;
		kind: ResolvedRef;
		url: string;
	},
): Array<Thing> {
	const playlist = buildPlaylistSchema({
		title: entry.data.title,
		trackCount: toFlatTracks(entry.data.tracks).length,
		url: props.url,
	});

	const article = buildArticleSchema({
		dateCreated: entry.data.dateCreated,
		dateUpdated: entry.data.dateUpdated,
		description: props.description,
		imageUrl: props.imageUrl,
		mainEntity: { '@id': playlist['@id'] },
		title: entry.data.title,
		url: props.url,
	});

	return buildEntryGraph({
		entities: [article, playlist],
		kind: props.kind,
		title: entry.data.title,
		url: props.url,
	});
}
