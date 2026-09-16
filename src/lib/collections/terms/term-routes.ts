import type { GetStaticPaths } from 'astro';
import type { CollectionKey } from 'astro:content';

import { getCollection } from 'astro:content';

import type { TermIndex } from '#lib/collections/terms/term-index.ts';

import { listPageSize } from '#constants.ts';

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
				pageSize: listPageSize,
				params: { slug: term.id },
				props: { term },
			}),
		);
	}) satisfies GetStaticPaths;
}

// Artists and Labels carry two sections, so splitting the second across pages has no good answer
export function createTermDetailPathsUnpaged<Collection extends CollectionKey>(
	collection: Collection,
	getIndex: () => Promise<TermIndex>,
	getAppearances: () => Promise<TermIndex>,
) {
	return (async () => {
		const [terms, index, appearances] = await Promise.all([
			getCollection(collection),
			getIndex(),
			getAppearances(),
		]);

		return terms.map((term) => ({
			params: { slug: term.id },
			props: {
				appearances: appearances.get(term.id) ?? [],
				items: index.get(term.id) ?? [],
				term,
			},
		}));
	}) satisfies GetStaticPaths;
}
