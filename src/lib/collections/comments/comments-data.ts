import { getCollection } from 'astro:content';

import type { CommentNode } from '#lib/collections/comments/comments-thread.ts';
import type { CommentValue } from '#lib/schemas/comments.ts';

import { buildThread } from '#lib/collections/comments/comments-thread.ts';

export type CommentsCollection = 'mixes' | 'posts' | 'reviews';

export interface EntryComments {
	count: number;
	thread: Array<CommentNode>;
}

// Scan the collection once per build, not once per page
let commentsPromise: Promise<Map<string, Array<CommentValue>>> | undefined;

// D1 keeps the slug a comment was written against, so a renamed entry answers for its former ids too
export async function getEntryComments(
	collection: CommentsCollection,
	entryId: string,
	formerIds?: Array<string>,
): Promise<EntryComments> {
	const commentsById = await getCommentsById();
	const comments: Array<CommentValue> = [];

	for (const id of [entryId, ...(formerIds ?? [])]) {
		comments.push(...(commentsById.get(`${collection}/${id}`) ?? []));
	}

	comments.sort((left, right) => left.date.getTime() - right.date.getTime());

	return { count: comments.length, thread: buildThread(comments) };
}

async function buildCommentsById(): Promise<Map<string, Array<CommentValue>>> {
	const entries = await getCollection('comments');

	return new Map(entries.map((entry) => [entry.id, entry.data.comments]));
}

// Keyed as the loader stores them; most entries have no row, and getEntry() warns on every miss
function getCommentsById(): Promise<Map<string, Array<CommentValue>>> {
	if (!commentsPromise) commentsPromise = buildCommentsById();
	return commentsPromise;
}
