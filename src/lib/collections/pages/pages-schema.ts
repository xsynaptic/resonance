import type { CollectionEntry } from 'astro:content';

import type { Thing } from '#lib/utils/seo-structured-data.ts';

import { identityLinks } from '#lib/site.ts';
import {
	buildAuthorSchema,
	buildWebPageSchema,
	profilePageId,
} from '#lib/utils/seo-structured-data.ts';

export function getPageSchemas(
	entry: CollectionEntry<'pages'>,
	props: {
		description: string | undefined;
		url: string;
	},
): Array<Thing> {
	const isPersonProfile = entry.id === profilePageId;

	return [
		buildWebPageSchema({
			description: props.description,
			isPersonProfile,
			title: entry.data.title,
			url: props.url,
		}),
		...(isPersonProfile
			? [buildAuthorSchema({ sameAs: identityLinks.map((link) => link.url) })]
			: []),
	];
}
