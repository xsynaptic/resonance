import type { SyndicationItem } from '@xsynaptic/astro-syndication';

import { anchorDateOnly, toSyndicationImage } from '@xsynaptic/astro-syndication';
import { getContentPath } from '@xsynaptic/shared/routing';
import { getImage } from 'astro:assets';

import type { FeedEntry } from '#lib/feed/feed-render.ts';

import { feedImageWidth, feedItemCount, siteTimezoneOffsetHours } from '#constants.ts';
import { getPublishedMixes } from '#lib/collections/mixes/mixes-data.ts';
import { getPublishedPosts } from '#lib/collections/posts/posts-data.ts';
import { getPublishedReviews } from '#lib/collections/reviews/reviews-data.ts';
import { createFeedContentRenderer } from '#lib/feed/feed-render.ts';
import { getImageFeaturedId } from '#lib/image/image-featured.ts';
import { getEntryDescription } from '#lib/utils/description-data.ts';
import { byDateCreatedDescending } from '#lib/utils/entries.ts';
import { getMediaImage } from '#lib/utils/media.ts';
import { resolveCredits, resolveTermLinks } from '#lib/utils/terms.ts';

type RenderFeedContent = Awaited<ReturnType<typeof createFeedContentRenderer>>;

const feedAuthors = [{ name: 'Basilisk' }];

export async function getFeedItems(site: URL) {
	const [mixes, posts, reviews, renderFeedContent] = await Promise.all([
		getPublishedMixes(),
		getPublishedPosts(),
		getPublishedReviews(),
		createFeedContentRenderer(site),
	]);

	const entries = [...mixes, ...posts, ...reviews]
		.toSorted(byDateCreatedDescending)
		.slice(0, feedItemCount);

	return await Promise.all(entries.map((entry) => toFeedItem(entry, { renderFeedContent, site })));
}

function getSiteDate(date: Date) {
	return anchorDateOnly(date, { utcOffsetHours: siteTimezoneOffsetHours });
}

async function getFeedTags(data: FeedEntry['data']) {
	const [styles, artists, labels] = await Promise.all([
		resolveTermLinks('styles', data.styles),
		resolveCredits('artists', 'artists' in data ? data.artists : undefined),
		resolveCredits('labels', data.labels),
	]);

	return [...new Set([...styles, ...artists, ...labels].map((term) => term.name))];
}

async function getFeedImage({ imageFeatured, title }: FeedEntry['data']) {
	const imageId = getImageFeaturedId(imageFeatured);

	if (!imageId) return;

	const source = getMediaImage(imageId);

	if (!source) return;

	const image = await getImage({ format: 'jpg', src: source, width: feedImageWidth });

	return toSyndicationImage(image, { alt: title });
}

async function toFeedItem(
	entry: FeedEntry,
	{ renderFeedContent, site }: { renderFeedContent: RenderFeedContent; site: URL },
) {
	const { data } = entry;

	const [description, contentHtml, tags, image] = await Promise.all([
		getEntryDescription(entry),
		renderFeedContent(entry),
		getFeedTags(data),
		getFeedImage(data),
	]);

	return {
		authors: feedAuthors,
		dateCreated: getSiteDate(data.dateCreated),
		tags,
		title: data.title,
		url: new URL(getContentPath(entry.collection, entry.id), site).href,
		...(contentHtml ? { contentHtml } : {}),
		...(data.dateUpdated ? { dateUpdated: getSiteDate(data.dateUpdated) } : {}),
		...(description ? { description } : {}),
		...(image ? { image } : {}),
	} satisfies SyndicationItem;
}
