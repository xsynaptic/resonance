import { openGraphImageHeight, openGraphImageWidth } from '@xsynaptic/shared/constants';
import { existsSync } from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { render, setGlyphCacheMaxBytes } from 'takumi-js';
import { Renderer } from 'takumi-js/node';

import type { OpenGraphEntry } from '#og-image/types.ts';

import { featuredImageSize, getOpenGraphElement } from '#og-image/element.tsx';
import { loadOpenGraphFonts } from '#og-image/fonts.ts';
import { contentDataPath } from '#shared/content-path.ts';
import { findWorkspaceRoot } from '#shared/utils.ts';

// The 8 MiB default evicts glyphs mid-run once a few faces and sizes are in play
const glyphCacheBytes = 64 * 1024 * 1024;

// Platforms re-encode the card anyway, so start from a high-quality original
const jpegQuality = 90;

// Frontmatter Featured Image paths are relative to this, matching `src/lib/utils/media.ts`
const mediaRoot = `${contentDataPath}/media`;

export interface ProcessedImage {
	data: Buffer;
	height: number;
	width: number;
}

// Fonts and glyph outlines live on the renderer, so build one and reuse it for every card
export async function createCardRenderer() {
	// Read when a cache is first used, so this has to run before the first render
	setGlyphCacheMaxBytes(glyphCacheBytes);

	const fonts = await loadOpenGraphFonts();
	const renderer = new Renderer();

	return async function renderCard(entry: OpenGraphEntry): Promise<Uint8Array> {
		return render(getOpenGraphElement(entry, await loadFeaturedImage(entry.imageFeaturedId)), {
			fonts,
			format: 'jpeg',
			height: openGraphImageHeight,
			quality: jpegQuality,
			renderer,
			width: openGraphImageWidth,
		});
	};
}

export function resolveFeaturedImagePath(imageFeaturedId: string): string {
	return path.join(findWorkspaceRoot(), mediaRoot, imageFeaturedId);
}

// Originals are gitignored and may be absent; a card without its art still beats no card
async function loadFeaturedImage(
	imageFeaturedId: string | undefined,
): Promise<ProcessedImage | undefined> {
	if (imageFeaturedId === undefined) return undefined;

	const imagePath = resolveFeaturedImagePath(imageFeaturedId);

	if (!existsSync(imagePath)) return undefined;

	// Raw RGBA hands off to Takumi with no intermediate encode
	// Featured Images are square in almost every case; `cover` fit handles the few that are not
	const { data, info } = await sharp(imagePath)
		.resize({ fit: 'cover', height: featuredImageSize, width: featuredImageSize })
		.ensureAlpha()
		.raw()
		.toBuffer({ resolveWithObject: true });

	return { data, height: info.height, width: info.width };
}
