import type { APIRoute } from 'astro';

import { getUrlPathIndexing } from '@xsynaptic/shared/sitemap';

import { getCatalog } from '#lib/catalog/catalog-data.ts';

export const GET = (async () => {
	const catalog = await getCatalog();

	const entries = catalog
		.all()
		.filter((item) => getUrlPathIndexing(item.url).index)
		.map(({ title, url }) => ({ title, url }));

	return Response.json(entries);
}) satisfies APIRoute;
