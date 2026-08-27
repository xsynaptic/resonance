import type { Font } from 'takumi-js';

import { OPEN_GRAPH_IMAGE_HEIGHT, OPEN_GRAPH_IMAGE_WIDTH } from '@xsynaptic/shared/constants';
import sharp from 'sharp';
import { render, setGlyphCacheMaxBytes } from 'takumi-js';
import { Renderer } from 'takumi-js/node';

import type { OpenGraphCard } from './types.js';

import { COVER_SIZE, getOpenGraphElement } from './element.js';

// The 8 MiB default evicts glyphs mid-run once a few faces and sizes are in play
const GLYPH_CACHE_BYTES = 64 * 1024 * 1024;

// Platforms re-encode the card anyway, so start from a high-quality original
const JPEG_QUALITY = 90;

export interface ProcessedImage {
	data: Buffer;
	height: number;
	width: number;
}

// Fonts and glyph outlines live on the renderer, so build one and reuse it for every card
export function createRenderer(fonts: Array<Font>) {
	// Read when a cache is first used, so this has to run before the first render
	setGlyphCacheMaxBytes(GLYPH_CACHE_BYTES);

	const renderer = new Renderer();

	return async function renderOpenGraphImage(
		card: OpenGraphCard,
		cover?: ProcessedImage,
	): Promise<Uint8Array> {
		return render(getOpenGraphElement(card, cover), {
			fonts,
			format: 'jpeg',
			height: OPEN_GRAPH_IMAGE_HEIGHT,
			quality: JPEG_QUALITY,
			renderer,
			width: OPEN_GRAPH_IMAGE_WIDTH,
		});
	};
}

// Raw RGBA hands off to Takumi with no intermediate encode
// Covers are square already in almost every case; `cover` handles the few that are not
export async function processCover(imagePath: string): Promise<ProcessedImage> {
	const { data, info } = await sharp(imagePath)
		.resize({ fit: 'cover', height: COVER_SIZE, width: COVER_SIZE })
		.ensureAlpha()
		.raw()
		.toBuffer({ resolveWithObject: true });

	return { data, height: info.height, width: info.width };
}
