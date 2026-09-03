import type {
	ImageFeatured,
	ImageFeaturedItem,
	ImageFeaturedObject,
} from '@xsynaptic/shared/schemas';

export function getImageFeaturedId(imageFeatured: ImageFeatured | undefined): string | undefined {
	if (!imageFeatured) return undefined;
	if (typeof imageFeatured === 'string') return imageFeatured;

	const [first] = imageFeatured;
	if (!first) return undefined;

	return isImageFeaturedObject(first) ? first.id : first;
}

// The hero-flagged image is not necessarily the first featured image
export function getImageHeroId(imageFeatured: ImageFeatured | undefined): string | undefined {
	if (!imageFeatured || !Array.isArray(imageFeatured)) return undefined;

	return imageFeatured.find(isImageHeroObject)?.id;
}

function isImageFeaturedObject(item: ImageFeaturedItem): item is ImageFeaturedObject {
	return typeof item === 'object';
}

function isImageHeroObject(item: ImageFeaturedItem): item is ImageFeaturedObject {
	return isImageFeaturedObject(item) && item.hero === true;
}
