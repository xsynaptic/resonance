const rootCollections = new Set(['pages', 'posts']);

export type IndexedCollection =
	| 'artists'
	| 'eras'
	| 'labels'
	| 'mixes'
	| 'posts'
	| 'regions'
	| 'reviews'
	| 'series'
	| 'styles'
	| 'themes';

export function getCollectionPath(collection: IndexedCollection): string {
	return `/${collection}/`;
}

export function getContentPath(collection: string, slug: string): string {
	if (rootCollections.has(collection)) {
		return `/${slug}/`;
	}
	return `/${collection}/${slug}/`;
}
