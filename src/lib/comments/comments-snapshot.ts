import type { ApprovedComment } from '@xsynaptic/astro-comments';

import { commentsSnapshotPath, commentsSnapshotSchema } from '@xsynaptic/shared/comments';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import pMemoize from 'p-memoize';

const isLocalDatabase = process.env.COMMENTS_D1_LOCAL === '1';

const snapshotPath = commentsSnapshotPath(isLocalDatabase);

// Read once per process, so a fresh pull needs a dev restart
export const readCommentsByThread = pMemoize(buildCommentsByThread);

async function buildCommentsByThread(): Promise<Map<string, Array<ApprovedComment>>> {
	const rows = await readRows();
	const commentsByThread = new Map<string, Array<ApprovedComment>>();

	for (const row of rows) {
		const existing = commentsByThread.get(row.thread);

		if (existing) existing.push(row);
		else commentsByThread.set(row.thread, [row]);
	}

	return commentsByThread;
}

// A build fails without a snapshot; dev warns instead, so a fresh clone still works
async function readRows(): Promise<Array<ApprovedComment>> {
	try {
		const document: unknown = JSON.parse(await readFile(path.resolve(snapshotPath), 'utf8'));

		return commentsSnapshotSchema.parse(document).rows;
	} catch (error) {
		const message = `No usable comment snapshot at ${snapshotPath} (${String(error)}); run \`pnpm scripts comments-pull\``;

		if (import.meta.env.PROD) throw new Error(message, { cause: error });

		console.warn(message);

		return [];
	}
}
