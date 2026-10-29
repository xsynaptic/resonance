import type { PageOpenGraphCard } from '@xsynaptic/shared/open-graph';
import type { ImageFeatured } from '@xsynaptic/shared/schemas';

import {
	openGraphDefaultId,
	openGraphHomeId,
	openGraphHomeImageId,
	siteTagline,
	siteTitle,
} from '@xsynaptic/shared/constants';
import {
	getOpenGraphCardPath,
	getOpenGraphId,
	getOpenGraphLabel,
} from '@xsynaptic/shared/open-graph';
import { OG_BASE_URL } from 'astro:env/server';

import { getImageFeaturedId } from '#lib/image/image-featured.ts';

interface OpenGraphEntry {
	collection: string;
	data: { imageFeatured?: ImageFeatured | undefined; title: string };
	id: string;
}

const collectionsWithStyle = new Set(['mixes', 'reviews']);

export const defaultOpenGraphCard: PageOpenGraphCard = {
	id: openGraphDefaultId,
	input: { title: siteTitle },
};

export const homeOpenGraphCard: PageOpenGraphCard = {
	id: openGraphHomeId,
	imageId: openGraphHomeImageId,
	input: { title: siteTagline },
};

export function getEntryOpenGraphCard(entry: OpenGraphEntry, style?: string): PageOpenGraphCard {
	return {
		id: getOpenGraphId(entry.collection, entry.id),
		imageId: getImageFeaturedId(entry.data.imageFeatured),
		input: {
			label: getOpenGraphLabel(entry.collection),
			style: collectionsWithStyle.has(entry.collection) ? style : undefined,
			title: entry.data.title,
		},
	};
}

export function getIndexOpenGraphCard(name: string, title: string): PageOpenGraphCard {
	return { id: getOpenGraphId('index', name), input: { title } };
}

// `OG_BASE_URL` is the seam for another origin; unset today, so cards ship from `dist/`
export function getOpenGraphImageUrl(card: PageOpenGraphCard, site: undefined | URL): string {
	return new URL(getOpenGraphCardPath(card), OG_BASE_URL ?? site).href;
}
