import type { ThreadRegistry } from '@xsynaptic/astro-comments';

import { getContentPath } from '@xsynaptic/shared/routing';

import { getPublishedMixes } from '#lib/collections/mixes/mixes-data.ts';
import { getPublishedPosts } from '#lib/collections/posts/posts-data.ts';
import { getPublishedReviews } from '#lib/collections/reviews/reviews-data.ts';
import { toThreadKey } from '#lib/comments/comments-data.ts';

export async function buildThreadRegistry(): Promise<ThreadRegistry> {
	const entries = [
		...(await getPublishedMixes()),
		...(await getPublishedPosts()),
		...(await getPublishedReviews()),
	];
	const registry: ThreadRegistry = {};

	for (const entry of entries) {
		if (entry.data.commentsEnabled === false) continue;

		const path = getContentPath(entry.collection, entry.id);

		for (const id of [entry.id, ...(entry.data.formerIds ?? [])]) {
			const key = toThreadKey(entry.collection, id);
			const claimed = registry[key];

			if (claimed !== undefined && claimed !== path) {
				throw new Error(`Thread ${key} resolves to both ${claimed} and ${path}`);
			}

			registry[key] = path;
		}
	}

	return registry;
}
