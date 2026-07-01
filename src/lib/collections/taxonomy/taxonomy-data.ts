import type { CollectionKey } from 'astro:content';

import { getCollection } from 'astro:content';

import type { ContentDoc, ContentItem } from '#lib/catalog/catalog-data.ts';

import { toContentItem } from '#lib/catalog/catalog-data.ts';

export type TermIndex = Map<string, Array<ContentItem>>;

async function buildIndex(collect: (index: TermIndex) => Promise<void>): Promise<TermIndex> {
	const index: TermIndex = new Map();
	await collect(index);
	return sortIndex(index);
}

// Add each entry to the index under every term it references via `getRefs`
function collectByTerm<Entry extends ContentDoc>(
	collection: CollectionKey,
	entries: Array<Entry>,
	getRefs: (entry: Entry) => Array<{ id: string }> | undefined,
	index: TermIndex,
): void {
	for (const entry of entries) {
		const refs = getRefs(entry);

		if (refs) {
			for (const ref of refs) {
				const list = index.get(ref.id) ?? [];
				list.push(toContentItem(collection, entry));
				index.set(ref.id, list);
			}
		}
	}
}

// Data-layer factory: each taxonomy supplies a `collect` callback that loads and indexes its collections
// Memoizes, sorts, and returns a lazy getter
function makeTermIndex(collect: (index: TermIndex) => Promise<void>): () => Promise<TermIndex> {
	let cached: Promise<TermIndex> | undefined;
	return () => {
		cached ??= buildIndex(collect);
		return cached;
	};
}

function sortIndex(index: TermIndex): TermIndex {
	for (const list of index.values()) {
		list.sort((first, second) => second.date.getTime() - first.date.getTime());
	}
	return index;
}

export const getCategoriesIndex = makeTermIndex(async (index) => {
	const [posts, designs, lists] = await Promise.all([
		getCollection('posts'),
		getCollection('designs'),
		getCollection('lists'),
	]);
	collectByTerm('posts', posts, (entry) => entry.data.categories, index);
	collectByTerm('designs', designs, (entry) => entry.data.categories, index);
	collectByTerm('lists', lists, (entry) => entry.data.categories, index);
});

export const getLabelsIndex = makeTermIndex(async (index) => {
	const [mixes, reviews, designs] = await Promise.all([
		getCollection('mixes'),
		getCollection('reviews'),
		getCollection('designs'),
	]);
	collectByTerm('mixes', mixes, (entry) => entry.data.labelsRef, index);
	collectByTerm('reviews', reviews, (entry) => entry.data.labelsRef, index);
	collectByTerm('designs', designs, (entry) => entry.data.labelsRef, index);
});

export const getArtistsIndex = makeTermIndex(async (index) => {
	const [mixes, reviews] = await Promise.all([getCollection('mixes'), getCollection('reviews')]);
	collectByTerm('mixes', mixes, (entry) => entry.data.artists, index);
	collectByTerm('reviews', reviews, (entry) => entry.data.artists, index);
});

export const getRegionsIndex = makeTermIndex(async (index) => {
	const [mixes, reviews] = await Promise.all([getCollection('mixes'), getCollection('reviews')]);
	collectByTerm('mixes', mixes, (entry) => entry.data.regions, index);
	collectByTerm('reviews', reviews, (entry) => entry.data.regions, index);
});

export const getSeriesIndex = makeTermIndex(async (index) => {
	const [mixes, reviews] = await Promise.all([getCollection('mixes'), getCollection('reviews')]);
	collectByTerm('mixes', mixes, (entry) => entry.data.series, index);
	collectByTerm('reviews', reviews, (entry) => entry.data.series, index);
});

export const getStylesIndex = makeTermIndex(async (index) => {
	const [mixes, reviews, lists] = await Promise.all([
		getCollection('mixes'),
		getCollection('reviews'),
		getCollection('lists'),
	]);
	collectByTerm('mixes', mixes, (entry) => entry.data.styles, index);
	collectByTerm('reviews', reviews, (entry) => entry.data.styles, index);
	collectByTerm('lists', lists, (entry) => entry.data.styles, index);
});

export const getTagsIndex = makeTermIndex(async (index) => {
	const posts = await getCollection('posts');
	collectByTerm('posts', posts, (entry) => entry.data.tags, index);
});

export const getErasIndex = makeTermIndex(async (index) => {
	const [mixes, reviews] = await Promise.all([getCollection('mixes'), getCollection('reviews')]);
	collectByTerm('mixes', mixes, (entry) => entry.data.eras, index);
	collectByTerm('reviews', reviews, (entry) => entry.data.eras, index);
});
