import type { Font } from 'takumi-js';

import { openGraphImageHeight, openGraphImageWidth } from '@xsynaptic/shared/constants';
import sharp from 'sharp';
import { render, setGlyphCacheMaxBytes } from 'takumi-js';
import { Renderer } from 'takumi-js/node';

import type { OpenGraphCard } from '#og-image/types.ts';

import { coverSize, getOpenGraphElement } from '#og-image/element.tsx';

// The 8 MiB default evicts glyphs mid-run once a few faces and sizes are in play
const glyphCacheBytes = 64 * 1024 * 1024;

// Platforms re-encode the card anyway, so start from a high-quality original
const jpegQuality = 90;

export interface ProcessedImage {
	data: Buffer;
	height: number;
	width: number;
}

// Fonts and glyph outlines live on the renderer, so build one and reuse it for every card
export function createRenderer(fonts: Array<Font>) {
	// Read when a cache is first used, so this has to run before the first render
	setGlyphCacheMaxBytes(glyphCacheBytes);

	const renderer = new Renderer();

	return async function renderOpenGraphImage(
		card: OpenGraphCard,
		cover?: ProcessedImage,
	): Promise<Uint8Array> {
		return render(getOpenGraphElement(card, cover), {
			fonts,
			format: 'jpeg',
			height: openGraphImageHeight,
			quality: jpegQuality,
			renderer,
			width: openGraphImageWidth,
		});
	};
}

// Raw RGBA hands off to Takumi with no intermediate encode
// Covers are square already in almost every case; `cover` handles the few that are not
export async function processCover(imagePath: string): Promise<ProcessedImage> {
	const { data, info } = await sharp(imagePath)
		.resize({ fit: 'cover', height: coverSize, width: coverSize })
		.ensureAlpha()
		.raw()
		.toBuffer({ resolveWithObject: true });

	return { data, height: info.height, width: info.width };
}
