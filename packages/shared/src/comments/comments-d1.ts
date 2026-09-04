import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { z } from 'zod';

const execFileAsync = promisify(execFile);

const databaseName = 'resonance-comments';

// wrangler's `--command` takes raw SQL, so ids are validated rather than escaped
const idPattern = /^[a-z0-9-]{1,64}$/i;

export const commentStatusSchema = z.enum(['approved', 'pending', 'rejected', 'spam']);

// Every column of `migrations/0001-comments.sql`; consumers `pick` the ones they select
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

interface CommandResult<Row> {
	meta: { changes: number };
	results: Array<Row>;
}

interface CommentsD1Options {
	cwd?: string | undefined;
	isLocal?: boolean | undefined;
}

// Local and remote pulls write separate files, so a production build never reads local data
export function commentsSnapshotPath(isLocal: boolean): string {
	return `node_modules/.cache/comments/approved-${isLocal ? 'local' : 'remote'}.json`;
}

export async function executeComments(
	sql: string,
	options: CommentsD1Options = {},
): Promise<number> {
	const results = await runCommand<never>(sql, options);

	return results.reduce((total, result) => total + result.meta.changes, 0);
}

export async function queryComments<Row>(
	sql: string,
	options: CommentsD1Options = {},
): Promise<Array<Row>> {
	const results = await runCommand<Row>(sql, options);

	return results.flatMap((result) => result.results);
}

export function toIdLiteral(id: string): string {
	if (!idPattern.test(id)) throw new Error(`"${id}" is not a comment id`);

	return `'${id}'`;
}

async function runCommand<Row>(
	sql: string,
	options: CommentsD1Options,
): Promise<Array<CommandResult<Row>>> {
	const { cwd, isLocal = false } = options;

	const { stdout } = await execFileAsync(
		'pnpm',
		[
			'exec',
			'wrangler',
			'd1',
			'execute',
			databaseName,
			isLocal ? '--local' : '--remote',
			'--json',
			'--command',
			sql,
		],
		// The corpus grows without bound; Node's 1 MB default would truncate it into a parse failure
		{ cwd, maxBuffer: Infinity },
	);

	return JSON.parse(stdout) as Array<CommandResult<Row>>;
}
