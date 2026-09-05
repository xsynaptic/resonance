import { openGraphBasePath, openGraphImageFormat } from '#constants.ts';

// Filename stem on disk and in the og:image URL; the generator and the page must agree
export function getOpenGraphId(collection: string, id: string): string {
	return `${collection}-${id}`;
}

export function getOpenGraphPath(collection: string, id: string): string {
	return `/${openGraphBasePath}/${getOpenGraphId(collection, id)}.${openGraphImageFormat}`;
}
