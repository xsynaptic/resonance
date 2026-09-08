import type { APIRoute, GetStaticPaths, InferGetStaticPropsType } from 'astro';

import { createCardRenderer } from '@xsynaptic/scripts/og-image';

import { getSampleOpenGraphCards } from '#dev/inventory/inventory-fixtures.ts';

// Fonts and glyph outlines live on the renderer, so build one and hold it for the dev server
let renderCard: ReturnType<typeof createCardRenderer> | undefined;

function getRenderCard() {
	if (!renderCard) {
		renderCard = createCardRenderer();
	}

	return renderCard;
}

export const getStaticPaths = (async () => {
	const cards = await getSampleOpenGraphCards();

	return cards.map((card) => ({ params: { key: card.key }, props: { card } }));
}) satisfies GetStaticPaths;

// Drawn per request, so a template edit shows on reload
export const GET = (async ({ props: { card } }) => {
	const render = await getRenderCard();

	// Takumi may return a Uint8Array backed by a SharedArrayBuffer, which Response rejects
	return new Response(new Uint8Array(await render(card.entry)), {
		headers: { 'Cache-Control': 'no-store', 'Content-Type': 'image/jpeg' },
	});
}) satisfies APIRoute<InferGetStaticPropsType<typeof getStaticPaths>>;
