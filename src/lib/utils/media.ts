import type { ImageMetadata } from 'astro';

// Frontmatter media paths are relative to packages/content/_media (e.g. 2017/01/x.jpg)
const MEDIA_ROOT = '/packages/content/_media';

// Glob must be a string literal; astro:assets only optimizes statically-analyzable image paths
const mediaImages = import.meta.glob<{ default: ImageMetadata }>(
	'/packages/content/_media/**/*.{avif,jpeg,jpg,png,webp}',
	{ eager: true },
);

// Fail-soft: originals are gitignored and may be absent, so a miss warns in DEV and falls back
export function getMediaImage(mediaPath: string): ImageMetadata | undefined {
	const image = mediaImages[`${MEDIA_ROOT}/${mediaPath}`];
	if (!image) {
		if (import.meta.env.DEV) {
			console.warn(`[media] no original for path "${mediaPath}"`);
		}
		return undefined;
	}
	return image.default;
}
