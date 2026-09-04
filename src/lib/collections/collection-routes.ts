import type { GetStaticPaths } from 'astro';

import type { ContentCollectionKey } from '#lib/catalog/catalog-types.ts';

import { blogPageSize, listPageSize } from '#constants.ts';
import { getCatalog } from '#lib/catalog/catalog-data.ts';
import { getPublishedPosts } from '#lib/collections/posts/posts-data.ts';

// Paginated static paths for a collection's list page: page 1 bare, pages 2+ at /<base>/<n>/
export function createEntryListPaths(collection: ContentCollectionKey) {
	return (async ({ paginate }) => {
		const catalog = await getCatalog();

		return paginate(catalog.byCollection(collection), { pageSize: listPageSize });
	}) satisfies GetStaticPaths;
}

export const createPostListPaths = (async ({ paginate }) => {
	const posts = await getPublishedPosts();

	return paginate(posts, { pageSize: blogPageSize });
}) satisfies GetStaticPaths;
