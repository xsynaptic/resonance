import type { CollectionKey } from 'astro:content';

import { getCollection } from 'astro:content';

// Taxonomies whose terms nest via a `parent` reference; flat taxonomies (artists, tags, series) are absent
export type HierarchicalCollection = 'eras' | 'labels' | 'regions' | 'styles';

const HIERARCHICAL_COLLECTIONS = new Set<CollectionKey>(['eras', 'labels', 'regions', 'styles']);

interface Hierarchy {
	childrenByParent: Map<string, Array<string>>;
	parentById: Map<string, string>;
}

export function isHierarchical(collection: CollectionKey): collection is HierarchicalCollection {
	return HIERARCHICAL_COLLECTIONS.has(collection);
}

const hierarchies = new Map<HierarchicalCollection, Promise<Hierarchy>>();

// The parent chain above `id`, root-first; cycle-guarded
export async function ancestorsOf(
	collection: HierarchicalCollection,
	id: string,
): Promise<Array<string>> {
	const { parentById } = await getHierarchy(collection);
	const chain: Array<string> = [];
	const seen = new Set<string>();
	let current = parentById.get(id);
	while (current !== undefined && !seen.has(current)) {
		seen.add(current);
		chain.push(current);
		current = parentById.get(current);
	}
	return chain.toReversed();
}

// Every term below `id`, depth-first; cycle-guarded against malformed parent data
export async function descendantsOf(
	collection: HierarchicalCollection,
	id: string,
): Promise<Array<string>> {
	const { childrenByParent } = await getHierarchy(collection);
	const out: Array<string> = [];
	const seen = new Set<string>();
	const stack = [...(childrenByParent.get(id) ?? [])];
	while (stack.length > 0) {
		const next = stack.pop();
		if (next === undefined || seen.has(next)) continue;
		seen.add(next);
		out.push(next);
		stack.push(...(childrenByParent.get(next) ?? []));
	}
	return out;
}

async function buildHierarchy(collection: HierarchicalCollection): Promise<Hierarchy> {
	const entries = await getCollection(collection);
	const parentById = new Map<string, string>();
	const childrenByParent = new Map<string, Array<string>>();
	for (const entry of entries) {
		// the collection union hides the optional `parent` reference; read it through a minimal shape cast
		const parentId = (entry.data as { parent?: { id: string } }).parent?.id;
		if (parentId === undefined) continue;
		parentById.set(entry.id, parentId);
		const siblings = childrenByParent.get(parentId) ?? [];
		siblings.push(entry.id);
		childrenByParent.set(parentId, siblings);
	}
	return { childrenByParent, parentById };
}

function getHierarchy(collection: HierarchicalCollection): Promise<Hierarchy> {
	let promise = hierarchies.get(collection);
	if (promise === undefined) {
		promise = buildHierarchy(collection);
		hierarchies.set(collection, promise);
	}
	return promise;
}
