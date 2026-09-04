import type { ImageMetadata } from 'astro';

// Frontmatter media paths are relative to packages/content/media (e.g. 2017/01/x.jpg)
const mediaRoot = '/packages/content/media';

// Patterns must be literals; astro:assets only optimizes statically-analyzable image paths
// Re-pulling the WordPress uploads brings back the `-WxH` derivatives; excluding them keeps 1.2 GB of unused assets out of the build
const mediaImages = import.meta.glob<{ default: ImageMetadata }>(
	[
		'/packages/content/media/**/*.{avif,jpeg,jpg,png,webp}',
		'!/packages/content/media/**/*-[0-9][0-9]*x[0-9][0-9]*.{avif,jpeg,jpg,png,webp}',
	],
	{ eager: true },
);

// Fail-soft: originals are gitignored and may be absent, so a miss warns in DEV and falls back
export function getMediaImage(mediaPath: string): ImageMetadata | undefined {
	const image = mediaImages[`${mediaRoot}/${mediaPath}`];
	if (!image) {
		if (import.meta.env.DEV) {
			console.warn(`[media] no original for path "${mediaPath}"`);
		}
		return undefined;
	}
	return image.default;
}
