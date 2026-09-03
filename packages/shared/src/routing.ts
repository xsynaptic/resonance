const rootCollections = new Set(['pages', 'posts']);

export function getContentUrl(collection: string, slug: string): string {
	if (rootCollections.has(collection)) {
		return `/${slug}/`;
	}
	return `/${collection}/${slug}/`;
}
