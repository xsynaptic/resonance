import type { GetStaticPaths } from 'astro';

import { ARCHIVE_PAGE_SIZE } from '#constants.ts';
import { getContentItems } from '#lib/catalog/catalog-data.ts';

// Paginated static paths for collection archives: page 1 bare, pages 2+ at /<base>/<n>/
export function createCollectionArchivePaths(collection: Parameters<typeof getContentItems>[0]) {
	return (async ({ paginate }) => {
		const items = await getContentItems(collection);

		return paginate(items, { pageSize: ARCHIVE_PAGE_SIZE });
	}) satisfies GetStaticPaths;
}
