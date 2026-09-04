import type { CollectionKey, ReferenceDataEntry } from 'astro:content';

import { getContentUrl } from '@xsynaptic/shared/routing';
import { getCollection, getEntries } from 'astro:content';

import type { HierarchicalCollection } from '#lib/collections/terms/hierarchy.ts';
import type { LabelRefValue, RefValue } from '#lib/schemas/refs.ts';

import { ancestorsOf } from '#lib/collections/terms/hierarchy.ts';
import { toSlug } from '#lib/utils/text.ts';

// url is set only when the ref links to a catalog entry; free-text and unresolved ids render plain
export interface ResolvedRef {
	label: string;
	url?: string;
}

// Every collection with a `title` field. excluding those that are data-only
export type TitledCollectionKey = Exclude<CollectionKey, 'downloads'>;

// Cache id->title per collection so ref resolution is one build-time scan per collection
const titleMaps = new Map<TitledCollectionKey, Promise<Map<string, string>>>();

// Cache slugified-title->id per collection, so a free-text ref can find the term it names
const slugMaps = new Map<TitledCollectionKey, Promise<Map<string, string>>>();

// Ids from a labels array that link to a term (bare strings are free text; objects carry the id)
export function labelIds(labels: Array<LabelRefValue> | undefined): Array<string> {
	if (!labels) return [];
	const ids: Array<string> = [];
	for (const label of labels) {
		if (typeof label !== 'string') ids.push(label.id);
	}
	return ids;
}

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

// Resolve polymorphic refs: an object links via id, a bare string links only if it names a term
// `name` overrides the derived title
export async function resolveRefs(
	collection: TitledCollectionKey,
	refs: Array<RefValue> | undefined,
): Promise<Array<ResolvedRef>> {
	if (!refs || refs.length === 0) return [];

	const [titles, slugs] = await Promise.all([getTitles(collection), getSlugs(collection)]);

	return refs.map((ref) => {
		if (typeof ref === 'string') {
			const id = slugs.get(toSlug(ref));
			// Keep the written spelling; only the link comes from the catalog
			return id === undefined ? { label: ref } : { label: ref, url: getContentUrl(collection, id) };
		}

		const title = titles.get(ref.id);
		if (title === undefined) {
			console.warn(`[refs] no ${collection} entry for id "${ref.id}"`);
			return { label: ref.name ?? ref.id };
		}

		return { label: ref.name ?? title, url: getContentUrl(collection, ref.id) };
	});
}

// Resolve a strict reference array (styles, regions, eras, formats, themes) into linkable pairs
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

// A track's artists may be a single ref or an array of them; resolution takes an array either way
export function toRefArray(value: Array<RefValue> | RefValue | undefined): Array<RefValue> {
	if (value === undefined) return [];
	return Array.isArray(value) ? value : [value];
}

async function buildSlugs(collection: TitledCollectionKey): Promise<Map<string, string>> {
	const entries = await getCollection(collection);
	const slugs = new Map<string, string>();
	for (const entry of entries) {
		const slug = toSlug(entry.data.title);
		// First entry wins; a duplicate name is too ambiguous to link on anyway
		if (slug !== '' && !slugs.has(slug)) slugs.set(slug, entry.id);
	}
	return slugs;
}

async function buildTitles(collection: TitledCollectionKey): Promise<Map<string, string>> {
	const entries = await getCollection(collection);
	return new Map(entries.map((entry) => [entry.id, entry.data.title]));
}

function getSlugs(collection: TitledCollectionKey): Promise<Map<string, string>> {
	let promise = slugMaps.get(collection);
	if (promise === undefined) {
		promise = buildSlugs(collection);
		slugMaps.set(collection, promise);
	}
	return promise;
}

function getTitles(collection: TitledCollectionKey): Promise<Map<string, string>> {
	let promise = titleMaps.get(collection);
	if (promise === undefined) {
		promise = buildTitles(collection);
		titleMaps.set(collection, promise);
	}
	return promise;
}
