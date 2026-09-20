import { z } from 'zod';

import type { D1CommandOptions } from '#d1.ts';

import { runD1Command } from '#d1.ts';

const databaseName = 'resonance-comments';

// wrangler's `--command` takes raw SQL, so ids are validated rather than escaped
const idPattern = /^[a-z0-9-]{1,64}$/i;

export const commentStatusSchema = z.enum(['approved', 'pending', 'rejected', 'spam']);

// Every column of `migrations/comments/0001-comments.sql`; consumers `pick` the ones they select
export const commentRowSchema = z.object({
	author: z.string(),
	author_email: z.string().nullable(),
	author_url: z.string().nullable(),
	body: z.string(),
	collection: z.string(),
	created_at: z.number(),
	entry_id: z.string(),
	gravatar_hash: z.string().nullable(),
	id: z.string(),
	ip_hash: z.string().nullable(),
	parent_id: z.string().nullable(),
	source: z.string(),
	status: commentStatusSchema,
	wp_post_id: z.number().nullable(),
});

export const approvedCommentSchema = commentRowSchema.pick({
	author: true,
	author_url: true,
	body: true,
	collection: true,
	created_at: true,
	entry_id: true,
	gravatar_hash: true,
	id: true,
	parent_id: true,
});

// The pull script and the site both parse with this, so their shapes cannot drift
export const commentsSnapshotSchema = z.object({
	pulledAt: z.iso.datetime(),
	rows: approvedCommentSchema.array(),
});

export type ApprovedComment = z.infer<typeof approvedCommentSchema>;

export type CommentRow = z.infer<typeof commentRowSchema>;

export type CommentsSnapshot = z.infer<typeof commentsSnapshotSchema>;

export type CommentStatus = z.infer<typeof commentStatusSchema>;

// Local and remote pulls write separate files, so a production build never reads local data
export function commentsSnapshotPath(isLocal: boolean): string {
	return `node_modules/.cache/comments/approved-${isLocal ? 'local' : 'remote'}.json`;
}

export async function executeComments(
	sql: string,
	options: D1CommandOptions = {},
): Promise<number> {
	const results = await runD1Command<never>(databaseName, sql, options);

	return results.reduce((total, result) => total + result.meta.changes, 0);
}

export async function queryComments<Row>(
	sql: string,
	options: D1CommandOptions = {},
): Promise<Array<Row>> {
	const results = await runD1Command<Row>(databaseName, sql, options);

	return results.flatMap((result) => result.results);
}

export function toIdLiteral(id: string): string {
	if (!idPattern.test(id)) throw new Error(`"${id}" is not a comment id`);

	return `'${id}'`;
}
