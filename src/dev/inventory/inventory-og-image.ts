import type { APIRoute, GetStaticPaths, InferGetStaticPropsType } from 'astro';

import {
	createCardRenderer,
	decodeFeaturedImage,
	resolveFeaturedImagePath,
} from '@xsynaptic/scripts/og-image';
import { existsSync } from 'node:fs';

import { getSampleOpenGraphCards } from '#dev/inventory/inventory-fixtures.ts';

// Fonts and glyph outlines live on the renderer, so build one and hold it for the dev server
let renderCard: ReturnType<typeof createCardRenderer> | undefined;

function getRenderCard() {
	if (!renderCard) {
		renderCard = createCardRenderer();
	}

	return renderCard;
}

async function readFeaturedImage(imageId: string | undefined) {
	if (imageId === undefined) return;

	const imagePath = resolveFeaturedImagePath(imageId);

	return existsSync(imagePath) ? decodeFeaturedImage(imagePath) : undefined;
}

export const getStaticPaths = (async () => {
	const samples = await getSampleOpenGraphCards();

	return samples.map((sample) => ({ params: { key: sample.key }, props: { sample } }));
}) satisfies GetStaticPaths;

// Drawn per request, so a template edit shows on reload
export const GET = (async ({ props: { sample } }) => {
	const render = await getRenderCard();
	const image = await readFeaturedImage(sample.card.imageId);

	// Takumi may return a Uint8Array backed by a SharedArrayBuffer, which Response rejects
	return new Response(new Uint8Array(await render(sample.card.input, image)), {
		headers: { 'Cache-Control': 'no-store', 'Content-Type': 'image/jpeg' },
	});
}) satisfies APIRoute<InferGetStaticPropsType<typeof getStaticPaths>>;
