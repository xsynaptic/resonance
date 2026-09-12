import type { CollectionKey } from 'astro:content';

import { getCollection } from 'astro:content';

import type { Hierarchy } from '#lib/utils/hierarchy.ts';

import { createHierarchy } from '#lib/utils/hierarchy.ts';
import { memoizeByKey } from '#lib/utils/memoize.ts';

// Term collections whose terms nest via a `parent` reference
// Flat ones (artists, formats, themes, series) are absent
export type HierarchicalCollection = 'eras' | 'labels' | 'regions' | 'styles';

const hierarchicalCollections = new Set<CollectionKey>(['eras', 'labels', 'regions', 'styles']);

// Root-first, unlike the substrate's nearest-first, because every caller here is building a trail
export async function ancestorsOf(
	collection: HierarchicalCollection,
	id: string,
): Promise<Array<string>> {
	const hierarchy = await getTermHierarchy(collection);
	return [...hierarchy.ancestorsOf(id)].toReversed();
}

export async function descendantsOf(
	collection: HierarchicalCollection,
	id: string,
): Promise<Array<string>> {
	const hierarchy = await getTermHierarchy(collection);
	return [...hierarchy.descendantsOf(id)];
}

export function isHierarchical(collection: CollectionKey): collection is HierarchicalCollection {
	return hierarchicalCollections.has(collection);
}

export const getTermHierarchy = memoizeByKey(buildHierarchy);

async function buildHierarchy(collection: HierarchicalCollection): Promise<Hierarchy> {
	const entries = await getCollection(collection);
	return createHierarchy(
		entries.map((entry) => {
			// The collection union hides the optional `parent` reference; read it through a minimal cast
			const parentId = (entry.data as { parent?: { id: string } }).parent?.id;
			return parentId === undefined ? { id: entry.id } : { id: entry.id, parentId };
		}),
	);
}
