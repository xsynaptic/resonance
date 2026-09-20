import type { CollectionKey, ReferenceDataEntry } from 'astro:content';

import { getContentPath } from '@xsynaptic/shared/routing';
import { getCollection, getEntries } from 'astro:content';

import type { HierarchicalCollection } from '#lib/collections/terms/hierarchy.ts';
import type { CreditValue, LabelCreditValue } from '#lib/schemas/credits.ts';

import { ancestorsOf } from '#lib/collections/terms/hierarchy.ts';
import { memoizeByKey } from '#lib/utils/memoize.ts';
import { toSlug } from '#lib/utils/text.ts';

// url is set only when the name matches a catalog entry; free text and unresolved ids render plain
export interface LinkedName {
	name: string;
	url?: string;
}

// Every collection with a `title` field. excluding those that are data-only
export type TitledCollectionKey = Exclude<CollectionKey, 'downloads'>;

// Ids from a labels array that link to a term (bare strings are free text; objects carry the id)
export function labelIds(labels: Array<LabelCreditValue> | undefined): Array<string> {
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
): Promise<Array<LinkedName>> {
	const ids = await ancestorsOf(collection, id);
	if (ids.length === 0) return [];

	const titles = await getTitles(collection);

	return ids.map((ancestorId) => ({
		name: titles.get(ancestorId) ?? ancestorId,
		url: getContentPath(collection, ancestorId),
	}));
}

// Resolve polymorphic credits: an object links via id, a bare string links only if it names a term
// `name` overrides the derived title
export async function resolveCredits(
	collection: TitledCollectionKey,
	credits: Array<CreditValue> | undefined,
): Promise<Array<LinkedName>> {
	if (!credits || credits.length === 0) return [];

	const [titles, slugs] = await Promise.all([getTitles(collection), getSlugs(collection)]);

	return credits.map((credit) => {
		if (typeof credit === 'string') {
			const id = slugs.get(toSlug(credit));
			// Keep the written spelling; only the link comes from the catalog
			return id === undefined
				? { name: credit }
				: { name: credit, url: getContentPath(collection, id) };
		}

		const title = titles.get(credit.id);
		if (title === undefined) {
			console.warn(`[credits] no ${collection} entry for id "${credit.id}"`);
			return { name: credit.name ?? credit.id };
		}

		return { name: credit.name ?? title, url: getContentPath(collection, credit.id) };
	});
}

// Resolve a strict reference array (styles, regions, eras, themes) into linkable pairs
export async function resolveTermLinks(
	collection: TitledCollectionKey,
	references: Array<ReferenceDataEntry<TitledCollectionKey>> | undefined,
): Promise<Array<LinkedName>> {
	if (!references || references.length === 0) return [];

	const entries = await getEntries(references);

	return entries.map((entry) => toLinkedName(collection, entry));
}

// A track's artists may be a single credit or an array of them; resolution takes an array either way
export function toCreditArray(
	value: Array<CreditValue> | CreditValue | undefined,
): Array<CreditValue> {
	if (value === undefined) return [];
	return Array.isArray(value) ? value : [value];
}

export function toLinkedName(
	collection: TitledCollectionKey,
	entry: { data: { title: string }; id: string },
): LinkedName {
	return { name: entry.data.title, url: getContentPath(collection, entry.id) };
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

// Cached slugified-title->id per collection, so a free-text credit can find the term it names
export const getSlugs = memoizeByKey(buildSlugs);

// Cached id->title per collection, so credit resolution is one build-time scan per collection
const getTitles = memoizeByKey(buildTitles);
