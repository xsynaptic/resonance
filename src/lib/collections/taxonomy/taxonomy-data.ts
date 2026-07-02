import type { CollectionKey } from 'astro:content';

import { getCollection } from 'astro:content';

import type { ContentDoc, ContentItem } from '#lib/catalog/catalog-data.ts';
import type { RefValue } from '#lib/schemas/refs.ts';

import { toContentItem } from '#lib/catalog/catalog-data.ts';
import { labelIds } from '#lib/utils/terms.ts';

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

export const getLabelsIndex = makeTermIndex(async (index) => {
	const [mixes, reviews, designs] = await Promise.all([
		getCollection('mixes'),
		getCollection('reviews'),
		getCollection('designs'),
	]);
	collectByTerm('mixes', mixes, (entry) => labelIdRefs(entry.data.labels), index);
	collectByTerm('reviews', reviews, (entry) => labelIdRefs(entry.data.labels), index);
	collectByTerm('designs', designs, (entry) => labelIdRefs(entry.data.labels), index);
});

// Adapt the polymorphic artist refs to {id} shape, keeping only linked (object) refs, not free text
function artistIdRefs(artists: Array<RefValue> | undefined): Array<{ id: string }> {
	if (!artists) return [];
	const refs: Array<{ id: string }> = [];
	for (const artist of artists) {
		if (typeof artist !== 'string') refs.push({ id: artist.id });
	}
	return refs;
}

// Adapt the unified labels array to the {id} reference shape collectByTerm expects
function labelIdRefs(labels: Parameters<typeof labelIds>[0]): Array<{ id: string }> {
	return labelIds(labels).map((id) => ({ id }));
}

export const getArtistsIndex = makeTermIndex(async (index) => {
	const [mixes, reviews] = await Promise.all([getCollection('mixes'), getCollection('reviews')]);
	collectByTerm('mixes', mixes, (entry) => artistIdRefs(entry.data.artists), index);
	collectByTerm('reviews', reviews, (entry) => artistIdRefs(entry.data.artists), index);
});

export const getRegionsIndex = makeTermIndex(async (index) => {
	const [mixes, reviews] = await Promise.all([getCollection('mixes'), getCollection('reviews')]);
	collectByTerm('mixes', mixes, (entry) => entry.data.regions, index);
	collectByTerm('reviews', reviews, (entry) => entry.data.regions, index);
});

// A series entry owns its members via `seriesItems` (ordered ids), so resolve those in place rather
// than scanning content for back-references; array order is the display order, so no date sort.
// Only audio releases carry series membership today; widen this if the extractor starts emitting it
// for other collections.
const SERIES_MEMBER_COLLECTIONS = ['mixes', 'reviews'] as const;

let seriesIndexPromise: Promise<TermIndex> | undefined;

export async function getSeriesIndex(): Promise<TermIndex> {
	seriesIndexPromise ??= buildSeriesIndex();
	return seriesIndexPromise;
}

async function buildSeriesIndex(): Promise<TermIndex> {
	const series = await getCollection('series');
	const membersById = await buildSeriesMemberCatalog();

	const index: TermIndex = new Map();
	for (const entry of series) {
		const items = (entry.data.seriesItems ?? [])
			.map((id) => {
				const item = membersById.get(id);
				if (item === undefined && import.meta.env.DEV) {
					console.warn(`[series] "${entry.id}" references unresolved seriesItems id "${id}"`);
				}
				return item;
			})
			.filter((item): item is ContentItem => item !== undefined);
		index.set(entry.id, items);
	}
	return index;
}

async function buildSeriesMemberCatalog(): Promise<Map<string, ContentItem>> {
	const membersById = new Map<string, ContentItem>();
	for (const collection of SERIES_MEMBER_COLLECTIONS) {
		const entries = await getCollection(collection);
		for (const entry of entries) {
			if (!membersById.has(entry.id)) membersById.set(entry.id, toContentItem(collection, entry));
		}
	}
	return membersById;
}

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
