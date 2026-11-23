import type { ThreadEntry, ThreadRegistry } from '@xsynaptic/astro-comments';

import { buildThreadRegistry } from '@xsynaptic/astro-comments';
import { getContentPath } from '@xsynaptic/shared/routing';

import { getPublishedMixes } from '#lib/collections/mixes/mixes-data.ts';
import { getPublishedPosts } from '#lib/collections/posts/posts-data.ts';
import { getPublishedReviews } from '#lib/collections/reviews/reviews-data.ts';
import { toThreadKey } from '#lib/comments/comments-data.ts';

export async function getThreadRegistry(): Promise<ThreadRegistry> {
	const entries = [
		...(await getPublishedMixes()),
		...(await getPublishedPosts()),
		...(await getPublishedReviews()),
	];
	const threads: Array<ThreadEntry> = [];

	for (const entry of entries) {
		if (entry.data.commentsEnabled === false) continue;

		threads.push({
			formerKeys: (entry.data.formerIds ?? []).map((id) => toThreadKey(entry.collection, id)),
			key: toThreadKey(entry.collection, entry.id),
			path: getContentPath(entry.collection, entry.id),
		});
	}

	return buildThreadRegistry(threads);
}
