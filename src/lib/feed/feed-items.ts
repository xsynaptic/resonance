import type { RSSFeedItem } from '@astrojs/rss';

import type { FeedEntry } from '#lib/feed/feed-render.ts';

import { feedItemCount } from '#constants.ts';
import { getPublishedMixes } from '#lib/collections/mixes/mixes-data.ts';
import { getPublishedPosts } from '#lib/collections/posts/posts-data.ts';
import { getPublishedReviews } from '#lib/collections/reviews/reviews-data.ts';
import { renderFeedContent } from '#lib/feed/feed-render.ts';
import { getEntryDescription } from '#lib/utils/description.ts';
import { getContentPath } from '#lib/utils/routing.ts';

export async function getFeedItems(site: URL) {
	const [mixes, posts, reviews] = await Promise.all([
		getPublishedMixes(),
		getPublishedPosts(),
		getPublishedReviews(),
	]);

	const entries = [...mixes, ...posts, ...reviews]
		.sort((first, second) => second.data.dateCreated.getTime() - first.data.dateCreated.getTime())
		.slice(0, feedItemCount);

	return await Promise.all(entries.map((entry) => toFeedItem(entry, site)));
}

async function toFeedItem(entry: FeedEntry, site: URL) {
	const description = await getEntryDescription(entry);
	const content = await renderFeedContent(entry, site);

	return {
		link: getContentPath(entry.collection, entry.id),
		pubDate: entry.data.dateCreated,
		title: entry.data.title,
		...(description ? { description } : {}),
		...(content ? { content } : {}),
	} satisfies RSSFeedItem;
}
