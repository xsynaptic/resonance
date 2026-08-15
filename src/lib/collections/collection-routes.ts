import type { GetStaticPaths } from 'astro';

import { LIST_PAGE_SIZE } from '#constants.ts';
import { getContentItems } from '#lib/catalog/catalog-data.ts';

// Paginated static paths for a collection's list page: page 1 bare, pages 2+ at /<base>/<n>/
export function createEntryListPaths(collection: Parameters<typeof getContentItems>[0]) {
	return (async ({ paginate }) => {
		const items = await getContentItems(collection);

		return paginate(items, { pageSize: LIST_PAGE_SIZE });
	}) satisfies GetStaticPaths;
}
