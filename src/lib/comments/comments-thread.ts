import type { ApprovedComment } from '@xsynaptic/shared/comments';

import { renderCommentBody, toAuthorHref } from '#lib/utils/comment-markdown.ts';

export interface CommentNode {
	author: string;
	authorHref: string | undefined;
	avatar: CommentAvatar | undefined;
	bodyHtml: string;
	date: Date;
	id: string;
	replies: Array<CommentNode>;
}

interface CommentAvatar {
	srcSet: string;
	url: string;
}

// `blank` leaves the site's own fallback tile showing when Gravatar has no image for the address
const gravatarUrl = 'https://www.gravatar.com/avatar';
const avatarSize = 48;

// Every level indents, so a long chain would walk off the right edge of a narrow screen
const maximumDepth = 3;

// A reply whose parent is missing becomes a root, so a rejected parent never hides its replies
export function buildThread(comments: Array<ApprovedComment>): Array<CommentNode> {
	const nodes = new Map(comments.map((comment) => [comment.id, toNode(comment)]));
	const thread: Array<CommentNode> = [];

	for (const comment of comments) {
		const node = nodes.get(comment.id);

		if (!node) continue;

		const parent = comment.parent_id === null ? undefined : nodes.get(comment.parent_id);

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

function toAvatar(gravatarHash: null | string): CommentAvatar | undefined {
	if (gravatarHash === null) return undefined;

	const url = toGravatarUrl(gravatarHash, avatarSize);

	return { srcSet: `${url} 1x, ${toGravatarUrl(gravatarHash, avatarSize * 2)} 2x`, url };
}

function toGravatarUrl(gravatarHash: string, size: number): string {
	return `${gravatarUrl}/${gravatarHash}?d=blank&s=${String(size)}`;
}

function toNode(comment: ApprovedComment): CommentNode {
	return {
		author: comment.author,
		authorHref: toAuthorHref(comment.author_url ?? undefined),
		avatar: toAvatar(comment.gravatar_hash),
		bodyHtml: renderCommentBody(comment.body),
		date: new Date(comment.created_at * 1000),
		id: comment.id,
		replies: [],
	};
}
