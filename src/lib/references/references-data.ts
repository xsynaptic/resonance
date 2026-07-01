import type { CollectionKey } from 'astro:content';

import { getCollection } from 'astro:content';

import { getContentUrl } from '#lib/utils/routing.ts';

export interface Reference {
	collection: CollectionKey;
	id: string;
	title: string;
	url: string;
}

// Taxonomy collections an inline <Link id> can resolve to; order is collision priority (earlier wins)
const linkableCollections = [
	'artists',
	'labels',
	'styles',
	'regions',
	'eras',
	'series',
	'categories',
	'tags',
] as const;

let referencesPromise: Promise<Map<string, Reference>> | undefined;

export async function getReferences(): Promise<Map<string, Reference>> {
	referencesPromise ??= buildReferences();
	return referencesPromise;
}

async function buildReferences(): Promise<Map<string, Reference>> {
	const referencesById = new Map<string, Reference>();

	for (const collection of linkableCollections) {
		const entries = await getCollection(collection);

		for (const entry of entries) {
			const existing = referencesById.get(entry.id);

			if (existing) {
				if (import.meta.env.DEV) {
					console.warn(
						`[references] slug "${entry.id}" exists in both "${existing.collection}" and "${collection}"; keeping "${existing.collection}"`,
					);
				}
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
