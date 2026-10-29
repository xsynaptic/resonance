import type { ImageMetadata } from 'astro';

// Frontmatter media paths are relative to packages/content/media (e.g. 2017/x.jpg)
const mediaRoot = '/packages/content/media';

// Patterns must be literals; astro:assets only optimizes statically-analyzable image paths
const mediaImages = import.meta.glob<{ default: ImageMetadata }>(
	[
		'/packages/content/media/**/[^_]*.{avif,jpeg,jpg,png,webp}',
		'!/packages/content/media/**/_*/**',
	],
	{ eager: true },
);

// Fail-soft: originals are gitignored and may be absent, so a miss warns in DEV and falls back
export function getMediaImage(mediaPath: string): ImageMetadata | undefined {
	const image = mediaImages[`${mediaRoot}/${mediaPath}`];
	if (!image) {
		if (import.meta.env.DEV) {
			console.warn(`[Media] Image missing: "${mediaPath}"`);
		}
		return undefined;
	}
	return image.default;
}
