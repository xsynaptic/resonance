import type { ApprovedComment } from '@xsynaptic/shared/comments';

import { commentsSnapshotPath, commentsSnapshotSchema } from '@xsynaptic/shared/comments';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const isLocalDatabase = process.env.COMMENTS_D1_LOCAL === '1';

const snapshotPath = commentsSnapshotPath(isLocalDatabase);

// Read once per process, so a fresh pull needs a dev restart
let commentsPromise: Promise<Map<string, Array<ApprovedComment>>> | undefined;

export function readCommentsByEntry(): Promise<Map<string, Array<ApprovedComment>>> {
	if (!commentsPromise) commentsPromise = buildCommentsByEntry();

	return commentsPromise;
}

async function buildCommentsByEntry(): Promise<Map<string, Array<ApprovedComment>>> {
	const rows = await readRows();
	const commentsByEntry = new Map<string, Array<ApprovedComment>>();

	for (const row of rows) {
		const key = `${row.collection}/${row.entry_id}`;
		const existing = commentsByEntry.get(key);

		if (existing) existing.push(row);
		else commentsByEntry.set(key, [row]);
	}

	return commentsByEntry;
}

// A build fails without a snapshot; dev warns instead, so a fresh clone still works
async function readRows(): Promise<Array<ApprovedComment>> {
	try {
		const document: unknown = JSON.parse(await readFile(path.resolve(snapshotPath), 'utf8'));

		return commentsSnapshotSchema.parse(document).rows;
	} catch (error) {
		const message = `No usable comment snapshot at ${snapshotPath} (${String(error)}); run \`pnpm comments-pull\``;

		if (import.meta.env.PROD) throw new Error(message, { cause: error });

		console.warn(message);

		return [];
	}
}
