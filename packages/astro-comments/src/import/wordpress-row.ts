import type { CommentStatus } from '#store.ts';

import { htmlToCommentMarkdown } from '#import/html-to-markdown.ts';
import { sha256 } from '#sha256.ts';

export interface WordPressCommentRow {
	comment_approved: string;
	comment_author: string;
	comment_author_email: string;
	comment_author_url: string;
	comment_content: string;
	comment_date_gmt: string;
	comment_ID: number | string;
	comment_parent: number | string;
}

export interface ImportedComment {
	author: string;
	authorEmail?: string;
	authorUrl?: string;
	body: string;
	createdAt: number;
	emailHash?: string;
	id: string;
	isOwner: boolean;
	parentId?: string;
	source: 'wordpress';
	status: CommentStatus;
	thread: string;
}

// Trash is kept as `rejected` rather than dropped, so its replies still have a row to point at
const statusByApproval: Partial<Record<string, CommentStatus>> = {
	0: 'pending',
	1: 'approved',
	'post-trashed': 'rejected',
	spam: 'spam',
	trash: 'rejected',
};

// WordPress keeps neither the thread key nor the Owner flag on the row
export async function toImportedComment(
	row: WordPressCommentRow,
	{ isOwner, thread }: { isOwner: boolean; thread: string },
): Promise<ImportedComment> {
	const status = statusByApproval[row.comment_approved];
	const createdAt = Date.parse(`${row.comment_date_gmt.replace(' ', 'T')}Z`) / 1000;

	if (!status)
		throw new Error(
			`Comment ${String(row.comment_ID)} has an unknown status "${row.comment_approved}"`,
		);

	if (Number.isNaN(createdAt))
		throw new TypeError(`Comment ${String(row.comment_ID)} has no GMT date`);

	const comment: ImportedComment = {
		author: row.comment_author.trim(),
		body: htmlToCommentMarkdown(row.comment_content),
		createdAt,
		id: `wp-${String(row.comment_ID)}`,
		isOwner,
		source: 'wordpress',
		status,
		thread,
	};
	const email = row.comment_author_email.trim().toLowerCase();
	const url = row.comment_author_url.trim();

	if (email !== '') {
		comment.authorEmail = email;
		comment.emailHash = await sha256(email);
	}

	if (url !== '') comment.authorUrl = url;

	if (String(row.comment_parent) !== '0') comment.parentId = `wp-${String(row.comment_parent)}`;

	return comment;
}
