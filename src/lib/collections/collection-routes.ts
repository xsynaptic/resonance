import type { GetStaticPaths } from 'astro';

import { blogPageSize, listPageSize } from '#constants.ts';
import { getContentItems } from '#lib/catalog/catalog-data.ts';
import { getPublishedPosts } from '#lib/collections/posts/posts-data.ts';

// Paginated static paths for a collection's list page: page 1 bare, pages 2+ at /<base>/<n>/
export function createEntryListPaths(collection: Parameters<typeof getContentItems>[0]) {
	return (async ({ paginate }) => {
		const items = await getContentItems(collection);

		return paginate(items, { pageSize: listPageSize });
	}) satisfies GetStaticPaths;
}

export const createPostListPaths = (async ({ paginate }) => {
	const posts = await getPublishedPosts();

	return paginate(posts, { pageSize: blogPageSize });
}) satisfies GetStaticPaths;
