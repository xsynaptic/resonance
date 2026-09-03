import { getEntry } from 'astro:content';

import type { CommentNode } from '#lib/collections/comments/comments-thread.ts';
import type { CommentValue } from '#lib/schemas/comments.ts';

import { buildThread } from '#lib/collections/comments/comments-thread.ts';

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
	const comments: Array<CommentValue> = [];

	for (const id of [entryId, ...(formerIds ?? [])]) {
		const entry = await getEntry('comments', `${collection}/${id}`);

		if (entry) comments.push(...entry.data.comments);
	}

	comments.sort((left, right) => left.date.getTime() - right.date.getTime());

	return { count: comments.length, thread: buildThread(comments) };
}
