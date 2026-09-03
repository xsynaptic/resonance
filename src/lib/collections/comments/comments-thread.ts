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

// 2x the 48px the avatar renders at; `blank` lets the site's own fallback tile show through
const gravatarUrl = 'https://www.gravatar.com/avatar';
const gravatarSize = 96;

// Every level indents, so a long chain would walk off the right edge of a narrow screen
const maximumDepth = 3;

// A reply whose parent is missing becomes a root, so a rejected parent never hides its replies
export function buildThread(comments: Array<CommentValue>): Array<CommentNode> {
	const nodes = new Map(comments.map((comment) => [comment.id, toNode(comment)]));
	const thread: Array<CommentNode> = [];

	for (const comment of comments) {
		const node = nodes.get(comment.id);

		if (!node) continue;

		const parent = comment.parentId === null ? undefined : nodes.get(comment.parentId);

		if (parent) parent.replies.push(node);
		else thread.push(node);
	}

	return capDepth(thread, 1);
}

// A reply deeper than the cap joins the list at the cap, keeping the thread's own order
function capDepth(nodes: Array<CommentNode>, depth: number): Array<CommentNode> {
	if (depth >= maximumDepth) return flattenReplies(nodes);

	for (const node of nodes) {
		node.replies = capDepth(node.replies, depth + 1);
	}

	return nodes;
}

function flattenReplies(nodes: Array<CommentNode>): Array<CommentNode> {
	const flattened: Array<CommentNode> = [];

	for (const node of nodes) {
		const { replies } = node;

		node.replies = [];
		flattened.push(node, ...flattenReplies(replies));
	}

	return flattened;
}

function toNode(comment: CommentValue): CommentNode {
	return {
		author: comment.author,
		authorHref: toAuthorHref(comment.authorUrl ?? undefined),
		avatarUrl:
			comment.gravatarHash === null
				? undefined
				: `${gravatarUrl}/${comment.gravatarHash}?d=blank&s=${String(gravatarSize)}`,
		bodyHtml: renderCommentBody(comment.body),
		date: comment.date,
		id: comment.id,
		replies: [],
	};
}
