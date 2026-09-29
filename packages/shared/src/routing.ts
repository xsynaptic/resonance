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

// Name to slug, matching the extractor's rule so a free-text name lines up with a term's id
export function toSlug(input: string): string {
	return input
		.toLowerCase()
		.normalize('NFKD')
		.replaceAll(/[\u{300}-\u{36F}]/gu, '')
		.replaceAll(/[^a-z0-9]+/gu, '-')
		.replaceAll(/^-+|-+$/gu, '');
}
