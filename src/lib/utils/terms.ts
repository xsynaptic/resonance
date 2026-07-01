import type { CollectionKey, ReferenceDataEntry } from 'astro:content';

import { getCollection, getEntries } from 'astro:content';

import type { LabelValue } from '#lib/schemas/index.ts';

import { getContentUrl } from '#lib/utils/routing.ts';

export interface TermLink {
	title: string;
	url: string;
}

let labelTitlesPromise: Promise<Map<string, string>> | undefined;

// Ids from the unified labels array that could resolve to a term (drops id-less free-text entries)
export function labelIds(labels: Array<LabelValue> | undefined): Array<string> {
	if (!labels) return [];
	const ids: Array<string> = [];
	for (const label of labels) {
		const id = typeof label === 'string' ? label : label.id;
		if (id !== undefined) ids.push(id);
	}
	return ids;
}

// Resolve the unified labels array to taxonomy links, keeping only entries whose id matches a term
export async function resolveLabelLinks(
	labels: Array<LabelValue> | undefined,
): Promise<Array<TermLink>> {
	const ids = labelIds(labels);
	if (ids.length === 0) return [];

	const titles = await getLabelTitles();
	const links: Array<TermLink> = [];
	for (const id of ids) {
		const title = titles.get(id);
		if (title === undefined) {
			if (import.meta.env.DEV) console.warn(`[labels] no label term for id "${id}"`);
			continue;
		}
		links.push({ title, url: getContentUrl('labels', id) });
	}
	return links;
}

// Resolve a collection's reference array into linkable {title, url} pairs (all collections carry `title`)
export async function resolveTermLinks(
	collection: CollectionKey,
	refs: Array<ReferenceDataEntry<CollectionKey>> | undefined,
): Promise<Array<TermLink>> {
	if (!refs || refs.length === 0) return [];

	const entries = await getEntries(refs);

	return entries.map((entry) => ({
		title: entry.data.title,
		url: getContentUrl(collection, entry.id),
	}));
}

async function buildLabelTitles(): Promise<Map<string, string>> {
	const entries = await getCollection('labels');
	return new Map(entries.map((entry) => [entry.id, entry.data.title]));
}

async function getLabelTitles(): Promise<Map<string, string>> {
	labelTitlesPromise ??= buildLabelTitles();
	return labelTitlesPromise;
}
