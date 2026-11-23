import type { ApprovedComment } from '@xsynaptic/astro-comments';
import type { CommentNode } from '@xsynaptic/astro-comments/render';

import { buildThread } from '@xsynaptic/astro-comments/render';

import { readSnapshotByThread } from '#lib/comments/comments-snapshot.ts';

export type CommentsCollection = 'mixes' | 'posts' | 'reviews';

export interface EntryComments {
	count: number;
	thread: Array<CommentNode>;
}

// A thread key holds the slug a comment was written against, so a renamed entry answers for its former ids too
export async function getEntryComments(
	collection: CommentsCollection,
	entryId: string,
	formerIds?: Array<string>,
): Promise<EntryComments> {
	const commentsByThread = await readSnapshotByThread();
	const comments: Array<ApprovedComment> = [];

	for (const id of [entryId, ...(formerIds ?? [])]) {
		comments.push(...(commentsByThread.get(toThreadKey(collection, id)) ?? []));
	}

	comments.sort((left, right) => left.createdAt - right.createdAt);

	return { count: comments.length, thread: buildThread(comments) };
}

export function toThreadKey(collection: CommentsCollection, entryId: string): string {
	return `${collection}/${entryId}`;
}
