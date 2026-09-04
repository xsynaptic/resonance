import type { ApprovedComment } from '@xsynaptic/shared/comments';

import type { CommentNode } from '#lib/comments/comments-thread.ts';

import { readCommentsByEntry } from '#lib/comments/comments-snapshot.ts';
import { buildThread } from '#lib/comments/comments-thread.ts';

export type CommentsCollection = 'mixes' | 'posts' | 'reviews';

export interface EntryComments {
	count: number;
	thread: Array<CommentNode>;
}

// D1 keeps the slug a comment was written against, so a renamed entry answers for its former ids too
export async function getEntryComments(
	collection: CommentsCollection,
	entryId: string,
	formerIds?: Array<string>,
): Promise<EntryComments> {
	const commentsByEntry = await readCommentsByEntry();
	const comments: Array<ApprovedComment> = [];

	for (const id of [entryId, ...(formerIds ?? [])]) {
		comments.push(...(commentsByEntry.get(`${collection}/${id}`) ?? []));
	}

	comments.sort((left, right) => left.created_at - right.created_at);

	return { count: comments.length, thread: buildThread(comments) };
}
