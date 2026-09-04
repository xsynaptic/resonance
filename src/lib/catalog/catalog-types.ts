import type { CollectionKey } from 'astro:content';

export type CatalogCollectionKey = ContentCollectionKey | TermCollectionKey;

export type CatalogItem = ContentCatalogItem | TermCatalogItem;

export type CatalogItemOf<Collection extends CatalogCollectionKey> =
	Collection extends ContentCollectionKey ? ContentCatalogItem : TermCatalogItem;

export interface ContentCatalogItem extends CatalogItemShared {
	collection: ContentCollectionKey;
	date: Date;
	releaseTitle?: string | undefined;
	subtitle?: string | undefined;
}

export type ContentCollectionKey = Extract<CollectionKey, 'mixes' | 'pages' | 'posts' | 'reviews'>;

// `termBaseSchema` carries no date, and a term's own creation date would describe nothing
export interface TermCatalogItem extends CatalogItemShared {
	collection: TermCollectionKey;
}

export type TermCollectionKey = Extract<
	CollectionKey,
	'artists' | 'eras' | 'formats' | 'labels' | 'regions' | 'series' | 'styles' | 'themes'
>;

interface CatalogItemShared {
	id: string;
	image?: string | undefined;
	title: string;
	url: string;
}
