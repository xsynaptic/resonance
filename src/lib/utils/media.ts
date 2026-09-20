import type { ImageMetadata } from 'astro';

import { mediaLqipPath } from '@xsynaptic/shared/constants';
import { readFileSync } from 'node:fs';
import path from 'node:path';

// Frontmatter media paths are relative to packages/content/media (e.g. 2017/x.jpg)
const mediaRoot = '/packages/content/media';

// Patterns must be literals; astro:assets only optimizes statically-analyzable image paths
const mediaImages = import.meta.glob<{ default: ImageMetadata }>(
	'/packages/content/media/**/*.{avif,jpeg,jpg,png,webp}',
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

// Written by `pnpm lqip` before each build and gitignored, so a fresh checkout has none
// Missing or unreadable degrades to no placeholder rather than failing the build
function loadLqipEntries(): Record<string, { lqip: string }> {
	try {
		const parsed = JSON.parse(readFileSync(path.resolve(process.cwd(), mediaLqipPath), 'utf8')) as {
			entries: Record<string, { lqip: string }>;
		};

		return parsed.entries;
	} catch {
		return {};
	}
}

const lqipEntries = loadLqipEntries();

export function getMediaLqip(mediaPath: string): string | undefined {
	return lqipEntries[mediaPath]?.lqip;
}
