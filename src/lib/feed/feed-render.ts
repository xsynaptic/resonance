import type { CollectionEntry } from 'astro:content';

import mdxRenderer from '@astrojs/mdx/server.js';
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import { render } from 'astro:content';
import sanitizeHtml from 'sanitize-html';

export type FeedEntry = CollectionEntry<'mixes' | 'posts' | 'reviews'>;

async function createFeedContainer() {
	const instance = await AstroContainer.create();

	// An MDX body is a component of its own; the container cannot render it otherwise
	instance.addServerRenderer({ name: 'mdx', renderer: mdxRenderer });

	return instance;
}

const container = await createFeedContainer();

export async function renderFeedContent(entry: FeedEntry, site: URL) {
	const { Content } = await render(entry);
	const html = await container.renderToString(Content, { locals: { isFeed: true } });

	return sanitizeHtml(html, feedSanitizeOptions(site));
}

// A reader resolves a relative URL against nothing, so links and images go out absolute
function absoluteAttribute(attribute: 'href' | 'src', site: URL) {
	return function transform(tagName: string, attribs: sanitizeHtml.Attributes) {
		const value = attribs[attribute];
		if (!value) return { attribs, tagName };

		return { attribs: { ...attribs, [attribute]: new URL(value, site).href }, tagName };
	};
}

function feedSanitizeOptions(site: URL) {
	return {
		allowedAttributes: {
			a: ['href', 'title'],
			img: ['alt', 'height', 'src', 'width'],
		},
		allowedTags: [...sanitizeHtml.defaults.allowedTags, 'h1', 'h2', 'img'],
		transformTags: {
			a: absoluteAttribute('href', site),
			img: absoluteAttribute('src', site),
		},
	} satisfies sanitizeHtml.IOptions;
}
