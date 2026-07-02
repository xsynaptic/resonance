import type { CollectionKey } from 'astro:content';

// Posts and pages render at the site root
const rootCollections = new Set<CollectionKey>(['pages', 'posts']);

// Singular route bases for these taxonomy archives
const routeBaseByCollection: Partial<Record<CollectionKey, string>> = {
	tags: 'tag',
};

export function getContentUrl(collection: CollectionKey, slug: string): string {
	if (rootCollections.has(collection)) {
		return `/${slug}/`;
	}
	const base = routeBaseByCollection[collection] ?? collection;
	return `/${base}/${slug}/`;
}
