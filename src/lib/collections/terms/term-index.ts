import type { CollectionKey } from 'astro:content';

import { getCollection } from 'astro:content';

import type { ContentDoc, ContentItem } from '#lib/catalog/catalog-data.ts';
import type { HierarchicalCollection } from '#lib/collections/terms/hierarchy.ts';
import type { RefValue } from '#lib/schemas/refs.ts';

import { toContentItem } from '#lib/catalog/catalog-data.ts';
import { descendantsOf } from '#lib/collections/terms/hierarchy.ts';
import { labelIds } from '#lib/utils/terms.ts';

export type TermIndex = Map<string, Array<ContentItem>>;

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

function dedupeById(items: Array<ContentItem>): Array<ContentItem> {
	const seen = new Set<string>();
	const out: Array<ContentItem> = [];
	for (const item of items) {
		if (seen.has(item.id)) continue;
		seen.add(item.id);
		out.push(item);
	}
	return out;
}

// Memoized index factory: collect into a fresh map, then finalize
// Flat term collections date-sort (the default); hierarchical ones pass `rollUpHierarchy`
function makeTermIndex(
	collect: (index: TermIndex) => Promise<void>,
	finalize: (index: TermIndex) => Promise<TermIndex> | TermIndex = sortIndex,
): () => Promise<TermIndex> {
	let cached: Promise<TermIndex> | undefined;
	return () => {
		cached ??= (async () => {
			const index: TermIndex = new Map();
			await collect(index);
			return finalize(index);
		})();
		return cached;
	};
}

// Fold each term's descendants' entries into its bucket, deduped and date-sorted
// A parent's page (e.g. /regions/africa/) then shows everything below it, not just direct tags
async function rollUpHierarchy(
	base: TermIndex,
	collection: HierarchicalCollection,
): Promise<TermIndex> {
	const entries = await getCollection(collection);
	const rolled: TermIndex = new Map();
	for (const entry of entries) {
		const termIds = [entry.id, ...(await descendantsOf(collection, entry.id))];
		const items = dedupeById(termIds.flatMap((termId) => base.get(termId) ?? []));
		if (items.length > 0) rolled.set(entry.id, items);
	}
	return sortIndex(rolled);
}

function sortIndex(index: TermIndex): TermIndex {
	for (const list of index.values()) {
		list.sort((first, second) => second.date.getTime() - first.date.getTime());
	}
	return index;
}

export const getLabelsIndex = makeTermIndex(
	async (index) => {
		const [mixes, reviews, posts] = await Promise.all([
			getCollection('mixes'),
			getCollection('reviews'),
			getCollection('posts'),
		]);
		collectByTerm('mixes', mixes, (entry) => labelIdRefs(entry.data.labels), index);
		collectByTerm('reviews', reviews, (entry) => labelIdRefs(entry.data.labels), index);
		collectByTerm('posts', posts, (entry) => labelIdRefs(entry.data.labels), index);
	},
	(index) => rollUpHierarchy(index, 'labels'),
);

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

// A mix reaches its artist's page through the alias it was published as, not through `artists`
export const getArtistsIndex = makeTermIndex(async (index) => {
	const [mixes, reviews, posts] = await Promise.all([
		getCollection('mixes'),
		getCollection('reviews'),
		getCollection('posts'),
	]);
	collectByTerm('mixes', mixes, (entry) => (entry.data.alias ? [entry.data.alias] : []), index);
	collectByTerm('reviews', reviews, (entry) => artistIdRefs(entry.data.artists), index);
	collectByTerm('posts', posts, (entry) => artistIdRefs(entry.data.artists), index);
});

export const getRegionsIndex = makeTermIndex(
	async (index) => {
		const [mixes, reviews, posts] = await Promise.all([
			getCollection('mixes'),
			getCollection('reviews'),
			getCollection('posts'),
		]);
		collectByTerm('mixes', mixes, (entry) => entry.data.regions, index);
		collectByTerm('reviews', reviews, (entry) => entry.data.regions, index);
		collectByTerm('posts', posts, (entry) => entry.data.regions, index);
	},
	(index) => rollUpHierarchy(index, 'regions'),
);

// A series entry owns its members via `seriesItems` (ordered ids), resolved in place, no back-ref scan
// Array order is display order, so no date sort
const SERIES_MEMBER_COLLECTIONS = ['mixes', 'reviews', 'posts'] as const;

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

export const getStylesIndex = makeTermIndex(
	async (index) => {
		const [mixes, reviews, posts] = await Promise.all([
			getCollection('mixes'),
			getCollection('reviews'),
			getCollection('posts'),
		]);
		collectByTerm('mixes', mixes, (entry) => entry.data.styles, index);
		collectByTerm('reviews', reviews, (entry) => entry.data.styles, index);
		collectByTerm('posts', posts, (entry) => entry.data.styles, index);
	},
	(index) => rollUpHierarchy(index, 'styles'),
);

// Formats and topics are post-only vocabularies; a post carries at most one format
export const getFormatsIndex = makeTermIndex(async (index) => {
	const posts = await getCollection('posts');
	collectByTerm('posts', posts, (entry) => (entry.data.format ? [entry.data.format] : []), index);
});

export const getTopicsIndex = makeTermIndex(async (index) => {
	const posts = await getCollection('posts');
	collectByTerm('posts', posts, (entry) => entry.data.topics, index);
});

export const getErasIndex = makeTermIndex(
	async (index) => {
		const [mixes, reviews, posts] = await Promise.all([
			getCollection('mixes'),
			getCollection('reviews'),
			getCollection('posts'),
		]);
		collectByTerm('mixes', mixes, (entry) => entry.data.eras, index);
		collectByTerm('reviews', reviews, (entry) => entry.data.eras, index);
		collectByTerm('posts', posts, (entry) => entry.data.eras, index);
	},
	(index) => rollUpHierarchy(index, 'eras'),
);
