import type { CollectionEntry } from 'astro:content';

import mdxRenderer from '@astrojs/mdx/server.js';
import { prepareSyndicationHtml } from '@xsynaptic/astro-syndication/html';
import { createSyndicationRenderer } from '@xsynaptic/astro-syndication/render';
import { render } from 'astro:content';

export type FeedEntry = CollectionEntry<'mixes' | 'posts' | 'reviews'>;

export async function createFeedContentRenderer(site: URL) {
	// An MDX body is a component of its own; the container cannot render it otherwise
	const renderFeed = await createSyndicationRenderer({
		renderers: [{ name: 'mdx', renderer: mdxRenderer }],
		site,
	});

	return async function renderFeedContent(entry: FeedEntry) {
		const { Content } = await render(entry);

		return prepareSyndicationHtml(await renderFeed(Content), { site });
	};
}
