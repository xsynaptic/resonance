import type { CollectionKey, ReferenceDataEntry } from 'astro:content';

import { getCollection, getEntries } from 'astro:content';

import type { HierarchicalCollection } from '#lib/collections/taxonomy/hierarchy.ts';
import type { LabelRefValue, RefValue } from '#lib/schemas/refs.ts';

import { ancestorsOf } from '#lib/collections/taxonomy/hierarchy.ts';
import { getContentUrl } from '#lib/utils/routing.ts';

// url is set only when the ref links to a catalog entry; free-text and unresolved ids render plain
export interface ResolvedRef {
	label: string;
	url?: string;
}

// Content-slug links (resolveSlugLink) always resolve, so url is required
export interface TermLink {
	title: string;
	url: string;
}

// Every collection with a `title` field; `downloads` is data-only (no title, no routes)
export type TitledCollectionKey = Exclude<CollectionKey, 'downloads'>;

// Cache id->title per collection so ref resolution is one build-time scan per collection
const titleMaps = new Map<TitledCollectionKey, Promise<Map<string, string>>>();

// Ids from a labels array that link to a term (bare strings are free text; objects carry the id)
export function labelIds(labels: Array<LabelRefValue> | undefined): Array<string> {
	if (!labels) return [];
	const ids: Array<string> = [];
	for (const label of labels) {
		if (typeof label !== 'string') ids.push(label.id);
	}
	return ids;
}

// Resolve a term's parent chain (root-first) to breadcrumb links; empty for a root term
export async function resolveAncestors(
	collection: HierarchicalCollection,
	id: string,
): Promise<Array<ResolvedRef>> {
	const ids = await ancestorsOf(collection, id);
	if (ids.length === 0) return [];

	const titles = await getTitles(collection);

	return ids.map((ancestorId) => ({
		label: titles.get(ancestorId) ?? ancestorId,
		url: getContentUrl(collection, ancestorId),
	}));
}

// Resolve polymorphic refs: a bare string is free text; an object links via id, name overrides the title
export async function resolveRefs(
	collection: TitledCollectionKey,
	refs: Array<RefValue> | undefined,
): Promise<Array<ResolvedRef>> {
	if (!refs || refs.length === 0) return [];

	const titles = await getTitles(collection);

	return refs.map((ref) => {
		if (typeof ref === 'string') return { label: ref };

		const title = titles.get(ref.id);
		if (title === undefined) {
			console.warn(`[refs] no ${collection} entry for id "${ref.id}"`);
			return { label: ref.name ?? ref.id };
		}

		return { label: ref.name ?? title, url: getContentUrl(collection, ref.id) };
	});
}

// Resolve a single optional id to a link url (for track/list items where the display text is separate)
export async function resolveRefUrl(
	collection: TitledCollectionKey,
	id: string | undefined,
): Promise<string | undefined> {
	if (id === undefined) return undefined;

	const titles = await getTitles(collection);
	if (!titles.has(id)) {
		console.warn(`[refs] no ${collection} entry for id "${id}"`);
		return undefined;
	}

	return getContentUrl(collection, id);
}

// Resolve a strict reference array (styles, regions, eras, tags) into linkable pairs
export async function resolveTermLinks(
	collection: TitledCollectionKey,
	refs: Array<ReferenceDataEntry<TitledCollectionKey>> | undefined,
): Promise<Array<ResolvedRef>> {
	if (!refs || refs.length === 0) return [];

	const entries = await getEntries(refs);

	return entries.map((entry) => ({
		label: entry.data.title,
		url: getContentUrl(collection, entry.id),
	}));
}

async function buildTitles(collection: TitledCollectionKey): Promise<Map<string, string>> {
	const entries = await getCollection(collection);
	return new Map(entries.map((entry) => [entry.id, entry.data.title]));
}

function getTitles(collection: TitledCollectionKey): Promise<Map<string, string>> {
	let promise = titleMaps.get(collection);
	if (promise === undefined) {
		promise = buildTitles(collection);
		titleMaps.set(collection, promise);
	}
	return promise;
}
