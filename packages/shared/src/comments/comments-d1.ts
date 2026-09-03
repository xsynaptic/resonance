import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const databaseName = 'resonance-comments';

// wrangler's `--command` takes raw SQL, so ids are validated rather than escaped
const idPattern = /^[a-z0-9-]{1,64}$/i;

// Every column of `migrations/0001-comments.sql`; consumers `Pick` the ones they select
export interface CommentRow {
	author: string;
	author_email: null | string;
	author_url: null | string;
	body: string;
	collection: string;
	created_at: number;
	entry_id: string;
	gravatar_hash: null | string;
	id: string;
	ip_hash: null | string;
	parent_id: null | string;
	source: string;
	status: CommentStatus;
	wp_post_id: null | number;
}

export type CommentStatus = 'approved' | 'pending' | 'rejected' | 'spam';

interface CommandResult<Row> {
	meta: { changes: number };
	results: Array<Row>;
}

interface CommentsD1Options {
	cwd?: string | undefined;
	isLocal?: boolean | undefined;
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
