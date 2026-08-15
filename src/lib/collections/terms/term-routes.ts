import type { GetStaticPaths } from 'astro';
import type { CollectionKey } from 'astro:content';

import { getCollection } from 'astro:content';

import type { TermIndex } from '#lib/collections/terms/term-index.ts';

import { LIST_PAGE_SIZE } from '#constants.ts';

// Paginated static paths for every term's detail page: page 1 bare, pages 2+ at /<term>/<n>/
// Generic over the collection so each route keeps the term's specific type
export function createTermDetailPaths<Collection extends CollectionKey>(
	collection: Collection,
	getIndex: () => Promise<TermIndex>,
) {
	return (async ({ paginate }) => {
		const [terms, index] = await Promise.all([getCollection(collection), getIndex()]);

		return terms.flatMap((term) =>
			paginate(index.get(term.id) ?? [], {
				pageSize: LIST_PAGE_SIZE,
				params: { slug: term.id },
				props: { term },
			}),
		);
	}) satisfies GetStaticPaths;
}
