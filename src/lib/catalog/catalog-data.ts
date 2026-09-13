import type { ImageFeatured } from '@xsynaptic/shared/schemas';
import type { CollectionEntry } from 'astro:content';

import { getContentPath } from '@xsynaptic/shared/routing';
import { getCollection } from 'astro:content';

import type { Catalog } from '#lib/catalog/catalog-factory.ts';
import type {
	CatalogCollectionKey,
	CatalogItem,
	ContentCatalogItem,
	ContentCollectionKey,
	TermCatalogItem,
	TermCollectionKey,
} from '#lib/catalog/catalog-types.ts';
import type { LabelCreditValue } from '#lib/schemas/credits.ts';
import type { WorkTitle } from '#lib/utils/work-title.ts';

import { createCatalog } from '#lib/catalog/catalog-factory.ts';
import { getImageFeaturedId } from '#lib/image/image-featured.ts';
import { resolveCredits } from '#lib/utils/terms.ts';
import { getWorkTitle, isWorkEntry } from '#lib/utils/work-title.ts';

const contentCollections = [
	'mixes',
	'pages',
	'posts',
	'reviews',
] as const satisfies ReadonlyArray<ContentCollectionKey>;

const termCollections = [
	'artists',
	'eras',
	'labels',
	'regions',
	'series',
	'styles',
	'themes',
] as const satisfies ReadonlyArray<TermCollectionKey>;

interface ContentEntry {
	data: {
		dateCreated: Date;
		imageFeatured?: ImageFeatured | undefined;
		labels?: Array<LabelCreditValue> | undefined;
		releaseYear?: string | undefined;
		title: string;
	};
	id: string;
}

interface TermEntry {
	data: {
		imageFeatured?: ImageFeatured | undefined;
		title: string;
	};
	id: string;
}

let catalogPromise: Promise<Catalog> | undefined;

export function getCatalog(): Promise<Catalog> {
	if (!catalogPromise) catalogPromise = buildCatalog();

	return catalogPromise;
}

// Ids are flat across the catalog: `<Link id>` and the site root both resolve without a collection
function assertUniqueIds(items: ReadonlyArray<CatalogItem>): void {
	const collectionsById = new Map<string, CatalogCollectionKey>();

	for (const item of items) {
		const claimed = collectionsById.get(item.id);

		if (claimed) {
			throw new Error(
				`[catalog] id "${item.id}" exists in both "${claimed}" and "${item.collection}"`,
			);
		}

		collectionsById.set(item.id, item.collection);
	}
}

async function buildCatalog(): Promise<Catalog> {
	return createCatalog(await buildCatalogItems());
}

async function buildCatalogItems(): Promise<Array<CatalogItem>> {
	const [contentItems, termItems] = await Promise.all([
		Promise.all(contentCollections.map((collection) => buildContentItems(collection))),
		Promise.all(termCollections.map((collection) => buildTermItems(collection))),
	]);

	const items = [
		...contentItems.flat().sort((first, second) => second.date.getTime() - first.date.getTime()),
		...termItems.flat(),
	];

	assertUniqueIds(items);

	return items;
}

async function buildContentItems(
	collection: ContentCollectionKey,
): Promise<Array<ContentCatalogItem>> {
	const entries = await getCollection(collection);

	return Promise.all(entries.map((entry) => toContentItem(entry)));
}

async function buildTermItems(collection: TermCollectionKey): Promise<Array<TermCatalogItem>> {
	const entries = await getCollection(collection);

	return entries.map((entry) => toTermItem(collection, entry));
}

async function metaLine(
	entry: ContentEntry,
	work: undefined | WorkTitle,
): Promise<string | undefined> {
	const credits = await resolveCredits('labels', entry.data.labels);
	const labels = credits.map((credit) => credit.name).join(' / ');
	const year = workYear(entry, work);

	if (labels === '') return year;

	return year === undefined ? labels : `${labels}, ${year}`;
}

async function toContentItem(
	entry: CollectionEntry<ContentCollectionKey>,
): Promise<ContentCatalogItem> {
	const { collection } = entry;
	const work = isWorkEntry(entry) ? await getWorkTitle(entry) : undefined;

	return {
		collection,
		date: entry.data.dateCreated,
		id: entry.id,
		image: getImageFeaturedId(entry.data.imageFeatured),
		subtitle: await metaLine(entry, work),
		title: entry.data.title,
		url: getContentPath(collection, entry.id),
		work,
	};
}

function toTermItem(collection: TermCollectionKey, entry: TermEntry): TermCatalogItem {
	return {
		collection,
		id: entry.id,
		image: getImageFeaturedId(entry.data.imageFeatured),
		title: entry.data.title,
		url: getContentPath(collection, entry.id),
	};
}

// A review's Work can predate the review by years; a mix's Work is the mix, posted when made
function workYear(entry: ContentEntry, work: undefined | WorkTitle): string | undefined {
	if (!work) return undefined;

	return entry.data.releaseYear ?? String(entry.data.dateCreated.getFullYear());
}
