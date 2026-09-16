import type { ApprovedComment, CommentsSnapshot, CommentStatus } from '@xsynaptic/shared/comments';

import {
	approvedCommentSchema,
	commentsSnapshotPath,
	commentsSnapshotSchema,
	queryComments,
} from '@xsynaptic/shared/comments';
import chalk from 'chalk';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

export interface PullCommentsOptions {
	// True when a deploy should keep the snapshot it already has if D1 cannot be reached
	allowStale?: boolean;
	isLocal?: boolean;
	rootPath: string;
}

type SnapshotRow = ApprovedComment & { status: CommentStatus };

// Pending rows are selected only so they can be counted; the snapshot holds the approved ones
const snapshotQuery = `
	SELECT id, collection, entry_id, parent_id, author, author_url, gravatar_hash, body, created_at, status
	FROM comments
	WHERE status IN ('approved', 'pending')
	ORDER BY collection, entry_id, created_at
`;

// Returns the pending count, or undefined when a stale snapshot stood in for an unreachable D1
export async function pullComments(options: PullCommentsOptions): Promise<number | undefined> {
	const { allowStale = false, isLocal = false, rootPath } = options;

	const filePath = path.join(rootPath, commentsSnapshotPath(isLocal));

	console.log(chalk.blue(`Pulling ${isLocal ? 'local' : 'remote'} comments...`));

	let rows: Array<SnapshotRow>;

	try {
		rows = await queryComments<SnapshotRow>(snapshotQuery, { cwd: rootPath, isLocal });
	} catch (error) {
		if (!allowStale) throw error;

		await reportStaleSnapshot(filePath, error);
		return undefined;
	}

	// Validate before writing so a change to D1's columns fails the pull, not the build
	const snapshot = {
		pulledAt: new Date().toISOString(),
		rows: approvedCommentSchema.array().parse(rows.filter((row) => row.status === 'approved')),
	} satisfies CommentsSnapshot;

	await mkdir(path.dirname(filePath), { recursive: true });
	await writeFile(filePath, JSON.stringify(snapshot));

	const pending = rows.length - snapshot.rows.length;

	console.log(
		chalk.green(
			`  ${String(snapshot.rows.length)} approved comments written to ${commentsSnapshotPath(isLocal)}`,
		),
	);
	printPendingCount(pending);

	return pending;
}

function printPendingCount(pending: number): void {
	if (pending === 0) {
		console.log(chalk.gray('  No comments pending'));
		return;
	}

	console.log(
		chalk.yellow(
			`  ${String(pending)} comment${pending === 1 ? '' : 's'} pending; run \`pnpm comments\``,
		),
	);
}

async function readSnapshot(filePath: string): Promise<CommentsSnapshot | undefined> {
	try {
		return commentsSnapshotSchema.parse(JSON.parse(await readFile(filePath, 'utf8')));
	} catch {
		return undefined;
	}
}

// Warn only: the build fails on its own when there is no snapshot to read
async function reportStaleSnapshot(filePath: string, error: unknown): Promise<void> {
	const snapshot = await readSnapshot(filePath);

	console.warn(
		chalk.yellow(
			snapshot
				? `  D1 is unreachable (${String(error)}); building from the snapshot pulled at ${snapshot.pulledAt}`
				: `  D1 is unreachable (${String(error)}) and there is no snapshot at ${filePath}`,
		),
	);
}
