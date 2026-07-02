import type { CollectionKey, ReferenceDataEntry } from 'astro:content';

import { getCollection, getEntries } from 'astro:content';

import type { LabelRefValue, RefValue } from '#lib/schemas/refs.ts';

import { getContentUrl } from '#lib/utils/routing.ts';

// A resolved reference for display: `url` is present only when the ref links to a catalog entry;
// free-text refs (and unresolved ids) render as plain text
export interface ResolvedRef {
	label: string;
	url?: string;
}

// Content-slug links (resolveSlugLink) always resolve, so url is required
export interface TermLink {
	title: string;
	url: string;
}

// Cache id->title per collection so ref resolution is one build-time scan per collection
const titleMaps = new Map<CollectionKey, Promise<Map<string, string>>>();

// Ids from a labels array that link to a term (bare strings are free text; objects carry the id)
export function labelIds(labels: Array<LabelRefValue> | undefined): Array<string> {
	if (!labels) return [];
	const ids: Array<string> = [];
	for (const label of labels) {
		if (typeof label !== 'string') ids.push(label.id);
	}
	return ids;
}

// Resolve the polymorphic ref array (artists, labels, members, projects). A bare string is free text;
// an object links via its id, with an optional name overriding the taxonomy-derived title.
export async function resolveRefs(
	collection: CollectionKey,
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
	collection: CollectionKey,
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

// Resolve a strict reference array (styles, regions, eras, categories, tags) into linkable pairs
export async function resolveTermLinks(
	collection: CollectionKey,
	refs: Array<ReferenceDataEntry<CollectionKey>> | undefined,
): Promise<Array<ResolvedRef>> {
	if (!refs || refs.length === 0) return [];

	const entries = await getEntries(refs);

	return entries.map((entry) => ({
		label: entry.data.title,
		url: getContentUrl(collection, entry.id),
	}));
}

async function buildTitles(collection: CollectionKey): Promise<Map<string, string>> {
	const entries = await getCollection(collection);
	return new Map(entries.map((entry) => [entry.id, entry.data.title]));
}

function getTitles(collection: CollectionKey): Promise<Map<string, string>> {
	let promise = titleMaps.get(collection);
	if (promise === undefined) {
		promise = buildTitles(collection);
		titleMaps.set(collection, promise);
	}
	return promise;
}
