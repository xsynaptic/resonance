import { approvedCommentSchema } from '@xsynaptic/astro-comments';
import { z } from 'zod';

import type { D1CommandOptions } from '#d1.ts';

import { runD1Command } from '#d1.ts';

const databaseName = 'resonance-comments';

// wrangler's `--command` takes raw SQL, so ids are validated rather than escaped
const idPattern = /^[a-z0-9-]{1,64}$/i;

const commentStatusSchema = z.enum(['approved', 'pending', 'rejected', 'spam']);

// Every column of `migrations/comments`; consumers `pick` the ones they select
export const commentRowSchema = approvedCommentSchema.extend({
	author_email: z.string().nullable(),
	ip_hash: z.string().nullable(),
	source: z.string(),
	status: commentStatusSchema,
});

// The pull script and the site both parse with this, so their shapes cannot drift
export const commentsSnapshotSchema = z.object({
	pulledAt: z.iso.datetime(),
	rows: approvedCommentSchema.array(),
});

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
