import type { CollectionKey } from 'astro:content';

// Posts and pages render at the site root
const rootCollections = new Set<CollectionKey>(['pages', 'posts']);

export function getContentUrl(collection: CollectionKey, slug: string): string {
	if (rootCollections.has(collection)) {
		return `/${slug}/`;
	}
	return `/${collection}/${slug}/`;
}
