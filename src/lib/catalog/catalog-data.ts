import type { ImageFeatured } from '@xsynaptic/shared/schemas';

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

import { createCatalog } from '#lib/catalog/catalog-factory.ts';
import { getImageFeaturedId } from '#lib/image/image-featured.ts';
import { getContentPath } from '#lib/utils/routing.ts';
import { resolveCredits } from '#lib/utils/terms.ts';

const contentCollections = [
	'mixes',
	'pages',
	'posts',
	'reviews',
] as const satisfies ReadonlyArray<ContentCollectionKey>;

const termCollections = [
	'artists',
	'eras',
	'formats',
	'labels',
	'regions',
	'series',
	'styles',
	'themes',
] as const satisfies ReadonlyArray<TermCollectionKey>;

// Only releases show a year subtitle; other collections already sit under a year heading when listed
const releaseCollections = new Set<ContentCollectionKey>(['mixes', 'reviews']);

interface ContentEntry {
	data: {
		dateCreated: Date;
		imageFeatured?: ImageFeatured | undefined;
		labels?: Array<LabelCreditValue> | undefined;
		releaseTitle?: string | undefined;
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

	return Promise.all(entries.map((entry) => toContentItem(collection, entry)));
}

async function buildTermItems(collection: TermCollectionKey): Promise<Array<TermCatalogItem>> {
	const entries = await getCollection(collection);

	return entries.map((entry) => toTermItem(collection, entry));
}

async function metaLine(
	collection: ContentCollectionKey,
	entry: ContentEntry,
): Promise<string | undefined> {
	const credits = await resolveCredits('labels', entry.data.labels);
	const labels = credits.map((credit) => credit.name).join(' / ');
	const year = releaseYear(collection, entry);

	if (labels === '') return year;

	return year === undefined ? labels : `${labels}, ${year}`;
}

// Only reviews carry releaseYear, since a release can predate its review by years
function releaseYear(collection: ContentCollectionKey, entry: ContentEntry): string | undefined {
	if (!releaseCollections.has(collection)) return undefined;

	return entry.data.releaseYear ?? String(entry.data.dateCreated.getFullYear());
}

async function toContentItem(
	collection: ContentCollectionKey,
	entry: ContentEntry,
): Promise<ContentCatalogItem> {
	return {
		collection,
		date: entry.data.dateCreated,
		id: entry.id,
		image: getImageFeaturedId(entry.data.imageFeatured),
		releaseTitle: entry.data.releaseTitle,
		subtitle: await metaLine(collection, entry),
		title: entry.data.title,
		url: getContentPath(collection, entry.id),
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
