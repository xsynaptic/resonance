const rootCollections = new Set(['pages', 'posts']);

export type IndexedCollection =
	| 'artists'
	| 'eras'
	| 'formats'
	| 'labels'
	| 'mixes'
	| 'posts'
	| 'regions'
	| 'reviews'
	| 'series'
	| 'styles'
	| 'themes';

// Posts render at the root, so their index cannot sit at /posts/
const collectionIndexPaths: Partial<Record<IndexedCollection, string>> = { posts: 'blog' };

export function getCollectionUrl(collection: IndexedCollection): string {
	return `/${collectionIndexPaths[collection] ?? collection}/`;
}

export function getContentUrl(collection: string, slug: string): string {
	if (rootCollections.has(collection)) {
		return `/${slug}/`;
	}
	return `/${collection}/${slug}/`;
}
