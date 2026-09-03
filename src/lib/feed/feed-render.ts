import type { CollectionEntry } from 'astro:content';

import mdxRenderer from '@astrojs/mdx/server.js';
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import { render } from 'astro:content';
import sanitizeHtml from 'sanitize-html';

export type FeedEntry = CollectionEntry<'mixes' | 'posts' | 'reviews'>;

async function createFeedContainer() {
	const instance = await AstroContainer.create();

	// An MDX body is a component of its own; without this the container has no renderer for it
	instance.addServerRenderer({ name: 'mdx', renderer: mdxRenderer });

	return instance;
}

// One container for the whole feed, so renders share a compiled component cache
const container = await createFeedContainer();

const feedSanitizeOptions = {
	allowedAttributes: {
		a: ['href', 'title'],
		img: ['alt', 'height', 'src', 'width'],
	},
	allowedTags: [...sanitizeHtml.defaults.allowedTags, 'h1', 'h2', 'img'],
} satisfies sanitizeHtml.IOptions;

export async function renderFeedContent(entry: FeedEntry, site: URL) {
	const { Content } = await render(entry);

	// `isFeed` switches MDX components to their stylesheet-free output
	const html = await container.renderToString(Content, { locals: { isFeed: true } });

	return sanitizeHtml(html, {
		...feedSanitizeOptions,
		transformTags: {
			a: absoluteAttribute('href', site),
			img: absoluteAttribute('src', site),
		},
	});
}

// Relative URLs are the one thing that silently breaks a feed; readers resolve against nothing
function absoluteAttribute(attribute: 'href' | 'src', site: URL) {
	return function transform(tagName: string, attribs: sanitizeHtml.Attributes) {
		const value = attribs[attribute];
		if (!value) return { attribs, tagName };

		try {
			return { attribs: { ...attribs, [attribute]: new URL(value, site).href }, tagName };
		} catch {
			return { attribs, tagName };
		}
	};
}
