import { openGraphBasePath, openGraphImageFormat } from '#constants.ts';

// The one definition of a card's identity, read by the generator, the redirect map and the page
// Kept free of node and image dependencies so production layouts can import it
export function getOpenGraphId(collection: string, id: string): string {
	return `${collection}-${id}`;
}

export function getOpenGraphPath(openGraphId: string): string {
	return `/${openGraphBasePath}/${openGraphId}.${openGraphImageFormat}`;
}
