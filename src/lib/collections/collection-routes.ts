import type { GetStaticPaths } from 'astro';

import { ARCHIVE_PAGE_SIZE } from '#constants.ts';
import { getContentItems } from '#lib/catalog/catalog-data.ts';

// Paginated static-paths builder for the collection archives
// Page 1 keeps the bare route URL, pages 2+ get /<base>/<n>/ (mirrors createTermArchivePaths)
export function createCollectionArchivePaths(collection: Parameters<typeof getContentItems>[0]) {
	return (async ({ paginate }) => {
		const items = await getContentItems(collection);

		return paginate(items, { pageSize: ARCHIVE_PAGE_SIZE });
	}) satisfies GetStaticPaths;
}
