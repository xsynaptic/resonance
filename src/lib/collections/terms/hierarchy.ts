import type { CollectionKey } from 'astro:content';

import { getCollection } from 'astro:content';

import type { Hierarchy } from '#lib/utils/hierarchy.ts';

import { createHierarchy } from '#lib/utils/hierarchy.ts';

// Term collections whose terms nest via a `parent` reference
// Flat ones (artists, formats, themes, series) are absent
export type HierarchicalCollection = 'eras' | 'labels' | 'regions' | 'styles';

const hierarchicalCollections = new Set<CollectionKey>(['eras', 'labels', 'regions', 'styles']);

export function isHierarchical(collection: CollectionKey): collection is HierarchicalCollection {
	return hierarchicalCollections.has(collection);
}

const hierarchies = new Map<HierarchicalCollection, Promise<Hierarchy>>();

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

export function getTermHierarchy(collection: HierarchicalCollection): Promise<Hierarchy> {
	let promise = hierarchies.get(collection);
	if (promise === undefined) {
		promise = buildHierarchy(collection);
		hierarchies.set(collection, promise);
	}
	return promise;
}

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
