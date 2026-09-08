import type { APIRoute } from 'astro';

import { renderCardById } from '@xsynaptic/scripts/og-image';

// eslint-disable-next-line unicorn/consistent-boolean-name -- Astro reads this export by name
export const prerender = false;

// Drawn per request, so a template edit shows on reload
export const GET: APIRoute = async ({ params }) => {
	const id = params.id;
	if (id === undefined) return new Response('Not found', { status: 404 });

	const image = await renderCardById(id);
	if (!image) return new Response('Not found', { status: 404 });

	// Takumi may return a Uint8Array backed by a SharedArrayBuffer, which Response rejects
	return new Response(new Uint8Array(image), {
		headers: { 'Cache-Control': 'no-store', 'Content-Type': 'image/jpeg' },
	});
};
