import { openGraphBasePath, openGraphImageFormat } from './constants.ts';

const rootCollections = new Set(['pages', 'posts']);

export function getContentUrl(collection: string, slug: string): string {
	if (rootCollections.has(collection)) {
		return `/${slug}/`;
	}
	return `/${collection}/${slug}/`;
}

// Filename stem on disk and in the og:image URL; the generator and the page must agree
export function getOpenGraphId(collection: string, id: string): string {
	return `${collection}-${id}`;
}

export function getOpenGraphPath(collection: string, id: string): string {
	return `/${openGraphBasePath}/${getOpenGraphId(collection, id)}.${openGraphImageFormat}`;
}
