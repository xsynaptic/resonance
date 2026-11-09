import type { CollectionEntry } from 'astro:content';

import mdxRenderer from '@astrojs/mdx/server.js';
import { prepareSyndicationHtml } from '@xsynaptic/astro-syndication/html';
import { createSyndicationRenderer } from '@xsynaptic/astro-syndication/render';
import { render } from 'astro:content';

export type SyndicationEntry = CollectionEntry<'mixes' | 'posts' | 'reviews'>;

export async function createSyndicationContentRenderer() {
	const site = new URL(import.meta.env.SITE);
	const renderFeed = await createSyndicationRenderer({
		renderers: [{ name: 'mdx', renderer: mdxRenderer }],
		site,
	});

	return async function renderSyndicationContent(entry: SyndicationEntry) {
		const { Content } = await render(entry);

		return prepareSyndicationHtml(await renderFeed(Content), { site });
	};
}
