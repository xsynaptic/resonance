import type { CollectionEntry } from 'astro:content';

import type { Thing } from '#lib/utils/seo-structured-data.ts';
import type { LinkedName } from '#lib/utils/terms.ts';

import { buildEntryGraph, buildReviewSchema } from '#lib/utils/seo-structured-data.ts';

export function getReviewSchemas(
	entry: CollectionEntry<'reviews'>,
	props: {
		artists: Array<LinkedName>;
		kind: LinkedName;
		labels: Array<LinkedName>;
		releaseTitle: string;
		url: string;
	},
): Array<Thing> {
	const review = buildReviewSchema({
		artist: props.artists.at(0)?.name,
		dateCreated: entry.data.dateCreated,
		discogsUrl: entry.data.discogsUrl,
		label: props.labels.at(0)?.name,
		rating: entry.data.rating,
		releaseTitle: props.releaseTitle,
		releaseYear: entry.data.releaseYear,
		title: entry.data.title,
		url: props.url,
	});

	return buildEntryGraph({
		entities: [review],
		kind: props.kind,
		title: entry.data.title,
		url: props.url,
	});
}
