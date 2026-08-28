import type { CollectionKey } from 'astro:content';

import { getCollection } from 'astro:content';

import { getContentUrl } from '#lib/utils/routing.ts';

export interface Reference {
	collection: CollectionKey;
	id: string;
	title: string;
	url: string;
}

// Term collections an inline <Link id> can resolve to; order is collision priority (earlier wins)
const linkableCollections = [
	'artists',
	'labels',
	'styles',
	'regions',
	'eras',
	'series',
	'formats',
	'topics',
] as const;

let referencesPromise: Promise<Map<string, Reference>> | undefined;

export async function getReferences(): Promise<Map<string, Reference>> {
	if (!referencesPromise) referencesPromise = buildReferences();
	return referencesPromise;
}

async function buildReferences(): Promise<Map<string, Reference>> {
	const referencesById = new Map<string, Reference>();

	for (const collection of linkableCollections) {
		const entries = await getCollection(collection);

		for (const entry of entries) {
			const existing = referencesById.get(entry.id);

			if (existing) {
				warnCollision(entry.id, existing.collection, collection);
			} else {
				referencesById.set(entry.id, {
					collection,
					id: entry.id,
					title: entry.data.title,
					url: getContentUrl(collection, entry.id),
				});
			}
		}
	}

	return referencesById;
}

function warnCollision(id: string, kept: CollectionKey, skipped: CollectionKey): void {
	if (!import.meta.env.DEV) return;

	console.warn(
		`[references] slug "${id}" exists in both "${kept}" and "${skipped}"; keeping "${kept}"`,
	);
}
