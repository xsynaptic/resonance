import { getEntry } from 'astro:content';

import type { CommentValue } from '#lib/schemas/comments.ts';

import { renderCommentBody, toAuthorHref } from '#lib/utils/comment-markdown.ts';

export interface CommentNode {
	author: string;
	authorHref: string | undefined;
	avatarUrl: string | undefined;
	bodyHtml: string;
	date: Date;
	id: string;
	replies: Array<CommentNode>;
}

export type CommentsCollection = 'mixes' | 'posts' | 'reviews';

export interface EntryComments {
	count: number;
	thread: Array<CommentNode>;
}

// 2x the 48px the avatar renders at; `mp` is Gravatar's mystery-person silhouette
const gravatarUrl = 'https://www.gravatar.com/avatar';
const gravatarSize = 96;

export async function getEntryComments(
	collection: CommentsCollection,
	entryId: string,
): Promise<EntryComments> {
	const entry = await getEntry('comments', `${collection}/${entryId}`);

	if (!entry) return { count: 0, thread: [] };

	const { comments } = entry.data;

	return { count: comments.length, thread: buildThread(comments) };
}

// A reply whose parent is missing becomes a root, so a rejected parent never hides its replies
function buildThread(comments: Array<CommentValue>): Array<CommentNode> {
	const nodes = new Map(comments.map((comment) => [comment.id, toNode(comment)]));
	const thread: Array<CommentNode> = [];

	for (const comment of comments) {
		const node = nodes.get(comment.id);

		if (!node) continue;

		const parent = comment.parentId === null ? undefined : nodes.get(comment.parentId);

		if (parent) parent.replies.push(node);
		else thread.push(node);
	}

	return thread;
}

function toNode(comment: CommentValue): CommentNode {
	return {
		author: comment.author,
		authorHref: toAuthorHref(comment.authorUrl ?? undefined),
		avatarUrl:
			comment.gravatarHash === null
				? undefined
				: `${gravatarUrl}/${comment.gravatarHash}?d=mp&s=${String(gravatarSize)}`,
		bodyHtml: renderCommentBody(comment.body),
		date: comment.date,
		id: comment.id,
		replies: [],
	};
}
