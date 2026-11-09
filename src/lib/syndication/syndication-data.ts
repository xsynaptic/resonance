import type { SyndicationItem, SyndicationPublication } from '@xsynaptic/astro-syndication';

import { anchorDateOnly, toSyndicationImage } from '@xsynaptic/astro-syndication';
import { getContentPath } from '@xsynaptic/shared/routing';
import { getImage } from 'astro:assets';

import type { SyndicationEntry } from '#lib/syndication/syndication-render.ts';

import {
	siteAuthorName,
	siteTimezoneOffsetHours,
	syndicationImageWidth,
	syndicationItemCount,
} from '#constants.ts';
import { getPublishedMixes } from '#lib/collections/mixes/mixes-data.ts';
import { getPublishedPosts } from '#lib/collections/posts/posts-data.ts';
import { getPublishedReviews } from '#lib/collections/reviews/reviews-data.ts';
import { t } from '#lib/i18n/i18n-strings.ts';
import { getImageFeaturedId } from '#lib/image/image-featured.ts';
import { createSyndicationContentRenderer } from '#lib/syndication/syndication-render.ts';
import { getEntryDescription } from '#lib/utils/description-data.ts';
import { byDateCreatedDescending } from '#lib/utils/entries.ts';
import { getMediaImage } from '#lib/utils/media.ts';
import { getAbsoluteUrl } from '#lib/utils/routing.ts';
import { resolveCredits, resolveTermLinks } from '#lib/utils/terms.ts';
import { formatStringTemplate } from '#lib/utils/text.ts';

type RenderSyndicationContent = Awaited<ReturnType<typeof createSyndicationContentRenderer>>;

const syndicationAuthors = [{ name: siteAuthorName }];

export async function getSyndicationItems() {
	const [mixes, posts, reviews, renderSyndicationContent] = await Promise.all([
		getPublishedMixes(),
		getPublishedPosts(),
		getPublishedReviews(),
		createSyndicationContentRenderer(),
	]);

	const entries = [...mixes, ...posts, ...reviews]
		.toSorted(byDateCreatedDescending)
		.slice(0, syndicationItemCount);

	return await Promise.all(
		entries.map((entry) => getSyndicationItem(entry, renderSyndicationContent)),
	);
}

export function getSyndicationPublication(site: SyndicationPublication['site']) {
	return {
		copyright: formatStringTemplate(t('footer.copyright'), { year: new Date().getFullYear() }),
		description: t('site.description'),
		language: 'en-us',
		site,
		title: t('site.title'),
	} satisfies SyndicationPublication;
}

function getSiteDate(date: Date) {
	return anchorDateOnly(date, { utcOffsetHours: siteTimezoneOffsetHours });
}

async function getSyndicationTags(data: SyndicationEntry['data']) {
	const [styles, artists, labels] = await Promise.all([
		resolveTermLinks('styles', data.styles),
		resolveCredits('artists', 'artists' in data ? data.artists : undefined),
		resolveCredits('labels', data.labels),
	]);

	return [...new Set([...styles, ...artists, ...labels].map((term) => term.name))];
}

async function getSyndicationImage({ imageFeatured, title }: SyndicationEntry['data']) {
	const imageId = getImageFeaturedId(imageFeatured);

	if (!imageId) return;

	const source = getMediaImage(imageId);

	if (!source) return;

	const image = await getImage({ format: 'jpg', src: source, width: syndicationImageWidth });

	return toSyndicationImage(image, { alt: title });
}

async function getSyndicationItem(
	entry: SyndicationEntry,
	renderSyndicationContent: RenderSyndicationContent,
) {
	const { data } = entry;

	const [description, contentHtml, tags, image] = await Promise.all([
		getEntryDescription(entry),
		renderSyndicationContent(entry),
		getSyndicationTags(data),
		getSyndicationImage(data),
	]);

	return {
		authors: syndicationAuthors,
		dateCreated: getSiteDate(data.dateCreated),
		tags,
		title: data.title,
		url: getAbsoluteUrl(getContentPath(entry.collection, entry.id)),
		...(contentHtml ? { contentHtml } : {}),
		...(data.dateUpdated ? { dateUpdated: getSiteDate(data.dateUpdated) } : {}),
		...(description ? { description } : {}),
		...(image ? { image } : {}),
	} satisfies SyndicationItem;
}
