import type { CommentAvatar } from '#render/gravatar.ts';
import type { ApprovedComment } from '#schemas.ts';

import { renderCommentBody, toAuthorHref } from '#render/comment-body.ts';
import { toGravatarAvatar } from '#render/gravatar.ts';

export interface CommentNode {
	author: string;
	authorHref: string | undefined;
	avatar: CommentAvatar | undefined;
	bodyHtml: string;
	date: Date;
	id: string;
	isOwner: boolean;
	replies: Array<CommentNode>;
}

export interface ThreadOptions {
	avatarSize?: number;
	// Every level indents, so a long chain would walk off the right edge of a narrow screen
	maximumDepth?: number;
}

// A reply whose parent is missing becomes a root, so a rejected parent never hides its replies
export function buildThread(
	comments: Array<ApprovedComment>,
	{ avatarSize = 48, maximumDepth = 3 }: ThreadOptions = {},
): Array<CommentNode> {
	const nodes = new Map(comments.map((comment) => [comment.id, toNode(comment, avatarSize)]));
	const thread: Array<CommentNode> = [];

	for (const comment of comments) {
		const node = nodes.get(comment.id);

		if (!node) continue;

		const parent = comment.parentId === undefined ? undefined : nodes.get(comment.parentId);

		if (parent) parent.replies.push(node);
		else thread.push(node);
	}

	return capDepth(thread, 1, maximumDepth);
}

// A reply deeper than the cap joins the list at the cap, keeping the thread's own order
function capDepth(
	nodes: Array<CommentNode>,
	depth: number,
	maximumDepth: number,
): Array<CommentNode> {
	if (depth >= maximumDepth) return flattenReplies(nodes);

	for (const node of nodes) {
		node.replies = capDepth(node.replies, depth + 1, maximumDepth);
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

function toNode(comment: ApprovedComment, avatarSize: number): CommentNode {
	return {
		author: comment.author,
		authorHref: toAuthorHref(comment.authorUrl),
		avatar: toGravatarAvatar(comment.emailHash, avatarSize),
		bodyHtml: renderCommentBody(comment.body),
		date: new Date(comment.createdAt * 1000),
		id: comment.id,
		isOwner: comment.isOwner,
		replies: [],
	};
}
