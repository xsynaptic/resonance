import type { CollectionEntry } from 'astro:content';

import type { Thing } from '#lib/utils/seo-structured-data.ts';
import type { LinkedName } from '#lib/utils/terms.ts';

import { buildArticleSchema, buildEntryGraph } from '#lib/utils/seo-structured-data.ts';

export function getPostSchemas(
	entry: CollectionEntry<'posts'>,
	props: {
		description: string | undefined;
		imageUrl: string;
		kind: LinkedName;
		url: string;
	},
): Array<Thing> {
	const article = buildArticleSchema({
		dateCreated: entry.data.dateCreated,
		dateUpdated: entry.data.dateUpdated,
		description: props.description,
		imageUrl: props.imageUrl,
		title: entry.data.title,
		url: props.url,
	});

	return buildEntryGraph({
		entities: [article],
		kind: props.kind,
		title: entry.data.title,
		url: props.url,
	});
}
