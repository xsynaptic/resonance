import type { ImageMetadata } from 'astro';

import { readFileSync } from 'node:fs';
import path from 'node:path';

// Frontmatter media paths are relative to packages/content/_media (e.g. 2017/01/x.jpg)
const MEDIA_ROOT = '/packages/content/_media';

// astro:assets only optimizes statically-analyzable images, so the glob must be a string literal;
// MEDIA_ROOT can't be interpolated here, it only rebuilds lookup keys
const mediaImages = import.meta.glob<{ default: ImageMetadata }>(
	'/packages/content/_media/**/*.{avif,jpeg,jpg,png,webp}',
	{ eager: true },
);

// Fail-soft: originals are gitignored and may be absent, so a miss warns in DEV and falls back to a placeholder
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

// Body <Img> carries a bare attachment id; map it to an upload path via the manifest
// Read via fs (not import) so a missing manifest degrades to an empty map instead of a build error
function loadAttachmentPaths(): Map<string, string> {
	try {
		const manifestPath = path.resolve(
			process.cwd(),
			'packages/content/_archive/media-manifest.json',
		);
		const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
			attachments: Array<{ id: string; path: string }>;
		};
		return new Map(manifest.attachments.map((attachment) => [attachment.id, attachment.path]));
	} catch {
		return new Map();
	}
}

const attachmentPaths = loadAttachmentPaths();

export function getMediaImageById(id: string): ImageMetadata | undefined {
	const mediaPath = attachmentPaths.get(id);
	if (!mediaPath) {
		if (import.meta.env.DEV) {
			console.warn(`[media] no manifest entry for attachment id "${id}"`);
		}
		return undefined;
	}
	return getMediaImage(mediaPath);
}
