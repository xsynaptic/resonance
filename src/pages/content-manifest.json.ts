import type { APIRoute } from 'astro';

import { isIndexableUrlPath } from '@xsynaptic/shared/sitemap';

import { getCatalog } from '#lib/catalog/catalog-data.ts';

export const GET = (async () => {
	const catalog = await getCatalog();

	const entries = catalog
		.all()
		.filter((item) => isIndexableUrlPath(item.url))
		.map(({ title, url }) => ({ title, url }));

	return Response.json(entries);
}) satisfies APIRoute;
