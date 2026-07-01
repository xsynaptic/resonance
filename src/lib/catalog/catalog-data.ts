import type { CollectionKey } from 'astro:content';

import { getCollection } from 'astro:content';

import { getContentUrl } from '#lib/utils/routing.ts';

// Entry fields the catalog projects; optional members are absent on collections that lack them (read as undefined)
export interface ContentDoc {
	data: {
		date: Date;
		imageFeatured?: string | undefined;
		releaseYear?: string | undefined;
		title: string;
	};
	id: string;
}

// A content entry projected to the flat shape cards render; extras stay optional so each card reads only what it shows
export interface ContentItem {
	collection: CollectionKey;
	date: Date;
	id: string;
	image?: string | undefined;
	subtitle?: string | undefined;
	title: string;
	url: string;
}

// Content collections that surface as cards; taxonomy collections are excluded
type ContentCollectionKey = 'designs' | 'lists' | 'mixes' | 'posts' | 'reviews';

// Projects a path string for the image, never resolving the asset here (the card does the lazy astro:assets lookup)
export function toContentItem(collection: CollectionKey, entry: ContentDoc): ContentItem {
	return {
		collection,
		date: entry.data.date,
		id: entry.id,
		image: entry.data.imageFeatured,
		subtitle: entry.data.releaseYear,
		title: entry.data.title,
		url: getContentUrl(collection, entry.id),
	};
}

const itemsByCollection = new Map<ContentCollectionKey, Promise<Array<ContentItem>>>();

// Memoized so the projection runs once per collection per build, not per consuming page
export function getContentItems(collection: ContentCollectionKey): Promise<Array<ContentItem>> {
	let cached = itemsByCollection.get(collection);
	if (!cached) {
		cached = buildContentItems(collection);
		itemsByCollection.set(collection, cached);
	}
	return cached;
}

async function buildContentItems(collection: ContentCollectionKey): Promise<Array<ContentItem>> {
	const entries = await getCollection(collection);
	return entries
		.map((entry) => toContentItem(collection, entry))
		.sort((first, second) => second.date.getTime() - first.date.getTime());
}
