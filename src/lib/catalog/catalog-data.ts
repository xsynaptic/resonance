import type { ImageFeatured } from '@xsynaptic/shared/schemas';
import type { CollectionKey } from 'astro:content';

import { getCollection } from 'astro:content';

import type { LabelRefValue } from '#lib/schemas/refs.ts';

import { getImageFeaturedId } from '#lib/image/image-featured.ts';
import { getContentUrl } from '#lib/utils/routing.ts';
import { resolveRefs } from '#lib/utils/terms.ts';

// Entry fields the catalog projects; optional members are absent on collections that lack them
export interface ContentDoc {
	data: {
		dateCreated: Date;
		imageFeatured?: ImageFeatured | undefined;
		labels?: Array<LabelRefValue> | undefined;
		releaseYear?: string | undefined;
		title: string;
	};
	id: string;
}

// Extras stay optional so each card reads only what it shows
export interface ContentItem {
	collection: CollectionKey;
	date: Date;
	id: string;
	image?: string | undefined;
	subtitle?: string | undefined;
	title: string;
	url: string;
}

// Content collections that surface as cards; term collections are excluded
type ContentCollectionKey = 'mixes' | 'posts' | 'reviews';

// Only releases show a year subtitle; other collections already sit under a year heading when listed
const releaseCollections = new Set<CollectionKey>(['mixes', 'reviews']);

// Projects a path string for the image; the card does the lazy astro:assets lookup
export async function toContentItem(
	collection: CollectionKey,
	entry: ContentDoc,
): Promise<ContentItem> {
	return {
		collection,
		date: entry.data.dateCreated,
		id: entry.id,
		image: getImageFeaturedId(entry.data.imageFeatured),
		subtitle: await metaLine(collection, entry),
		title: entry.data.title,
		url: getContentUrl(collection, entry.id),
	};
}

async function metaLine(collection: CollectionKey, entry: ContentDoc): Promise<string | undefined> {
	const refs = await resolveRefs('labels', entry.data.labels);
	const labels = refs.map((ref) => ref.label).join(' / ');
	const year = releaseYear(collection, entry);

	if (labels === '') return year;

	return year === undefined ? labels : `${labels}, ${year}`;
}

// Mixes no longer carry releaseYear; it always matched dateCreated's year
// Reviews keep theirs, since a release can predate its review by years
function releaseYear(collection: CollectionKey, entry: ContentDoc): string | undefined {
	if (!releaseCollections.has(collection)) return undefined;
	return entry.data.releaseYear ?? String(entry.data.dateCreated.getFullYear());
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
	const items = await Promise.all(entries.map((entry) => toContentItem(collection, entry)));

	return items.sort((first, second) => second.date.getTime() - first.date.getTime());
}
