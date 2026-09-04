import type { CollectionEntry } from 'astro:content';

import { getCollection } from 'astro:content';

import type { ContentCatalogItem } from '#lib/catalog/catalog-types.ts';
import type { HierarchicalCollection } from '#lib/collections/terms/hierarchy.ts';
import type { RefValue } from '#lib/schemas/refs.ts';

import { getCatalog } from '#lib/catalog/catalog-data.ts';
import { descendantsOf } from '#lib/collections/terms/hierarchy.ts';
import { labelIds } from '#lib/utils/terms.ts';

export type TermIndex = Map<string, Array<ContentCatalogItem>>;

const memberCollections = ['mixes', 'reviews', 'posts'] as const;

interface Member {
	entry: MemberEntry;
	item: ContentCatalogItem;
}

type MemberEntry = CollectionEntry<(typeof memberCollections)[number]>;

type TermRefs = (entry: MemberEntry) => Array<{ id: string }> | undefined;

let membersPromise: Promise<Array<Member>> | undefined;

// A mix reaches its artist's page through the alias it was published as, not through `artists`
function artistRefs(entry: MemberEntry): Array<{ id: string }> {
	if (entry.collection === 'mixes') return entry.data.alias ? [entry.data.alias] : [];

	return toIdRefs(entry.data.artists);
}

async function buildMembers(): Promise<Array<Member>> {
	const [catalog, collections] = await Promise.all([
		getCatalog(),
		Promise.all(memberCollections.map((collection) => getCollection(collection))),
	]);

	const itemsById = new Map(
		catalog.byCollection('mixes', 'reviews', 'posts').map((item) => [item.id, item] as const),
	);

	const members: Array<Member> = [];

	for (const entry of collections.flat()) {
		const item = itemsById.get(entry.id);

		if (item) members.push({ entry, item });
	}

	return members;
}

async function buildTermIndex(
	getRefs: TermRefs,
	finalize: (index: TermIndex) => Promise<TermIndex> | TermIndex,
): Promise<TermIndex> {
	const members = await getMembers();
	const index: TermIndex = new Map();

	for (const { entry, item } of members) {
		const refs = getRefs(entry) ?? [];

		for (const ref of refs) {
			const list = index.get(ref.id) ?? [];

			list.push(item);
			index.set(ref.id, list);
		}
	}

	return finalize(index);
}

function dedupeById(items: Array<ContentCatalogItem>): Array<ContentCatalogItem> {
	const seen = new Set<string>();
	const deduped: Array<ContentCatalogItem> = [];

	for (const item of items) {
		if (seen.has(item.id)) continue;

		seen.add(item.id);
		deduped.push(item);
	}

	return deduped;
}

// Formats are a post-only vocabulary; a post carries at most one format
function formatRefs(entry: MemberEntry): Array<{ id: string }> {
	if (entry.collection !== 'posts' || !entry.data.format) return [];

	return [entry.data.format];
}

// One pass shared by every index, so an entry is paired with its catalog item once per build
function getMembers(): Promise<Array<Member>> {
	if (!membersPromise) membersPromise = buildMembers();

	return membersPromise;
}

// Flat term collections date-sort (the default); hierarchical ones pass `rollUp`
function makeTermIndex(
	getRefs: TermRefs,
	finalize: (index: TermIndex) => Promise<TermIndex> | TermIndex = sortIndex,
): () => Promise<TermIndex> {
	let cached: Promise<TermIndex> | undefined;

	return () => {
		if (!cached) cached = buildTermIndex(getRefs, finalize);

		return cached;
	};
}

function rollUp(collection: HierarchicalCollection) {
	return (index: TermIndex) => rollUpHierarchy(index, collection);
}

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

// Keeps only the linked (object) refs; free text carries no id to index by
function toIdRefs(refs: Array<RefValue> | undefined): Array<{ id: string }> {
	if (!refs) return [];

	const idRefs: Array<{ id: string }> = [];

	for (const ref of refs) {
		if (typeof ref !== 'string') idRefs.push({ id: ref.id });
	}

	return idRefs;
}

export const getArtistsIndex = makeTermIndex(artistRefs);

export const getErasIndex = makeTermIndex((entry) => entry.data.eras, rollUp('eras'));

export const getFormatsIndex = makeTermIndex(formatRefs);

export const getLabelsIndex = makeTermIndex(
	(entry) => labelIds(entry.data.labels).map((id) => ({ id })),
	rollUp('labels'),
);

export const getRegionsIndex = makeTermIndex((entry) => entry.data.regions, rollUp('regions'));

export const getStylesIndex = makeTermIndex((entry) => entry.data.styles, rollUp('styles'));

export const getThemesIndex = makeTermIndex((entry) => entry.data.themes);

let seriesIndexPromise: Promise<TermIndex> | undefined;

export function getSeriesIndex(): Promise<TermIndex> {
	if (!seriesIndexPromise) seriesIndexPromise = buildSeriesIndex();

	return seriesIndexPromise;
}

// A series owns its membership through `seriesItems`, an ordered id list, so no date sort
async function buildSeriesIndex(): Promise<TermIndex> {
	const [series, members] = await Promise.all([getCollection('series'), getMembers()]);

	const itemsById = new Map(members.map(({ item }) => [item.id, item] as const));
	const index: TermIndex = new Map();

	for (const entry of series) {
		const items = (entry.data.seriesItems ?? [])
			.map((id) => {
				const item = itemsById.get(id);

				if (item === undefined && import.meta.env.DEV) {
					console.warn(`[series] "${entry.id}" references unresolved seriesItems id "${id}"`);
				}

				return item;
			})
			.filter((item) => item !== undefined);

		index.set(entry.id, items);
	}

	return index;
}
