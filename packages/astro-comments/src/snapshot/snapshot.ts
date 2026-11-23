import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';

import type { ApprovedComment } from '#schemas.ts';
import type { CommentModerationStore } from '#store.ts';

import { approvedCommentSchema } from '#schemas.ts';

export type SnapshotTarget = 'local' | 'remote';

export const commentsSnapshotSchema = z.object({
	pulledAt: z.iso.datetime(),
	rows: approvedCommentSchema.array(),
});

export type CommentsSnapshot = z.infer<typeof commentsSnapshotSchema>;

export interface SnapshotTally {
	approved: number;
	pending: number;
}

export async function readCommentsByThread(
	filePath: string,
): Promise<Map<string, Array<ApprovedComment>>> {
	const { rows } = await readCommentsSnapshot(filePath);
	const commentsByThread = new Map<string, Array<ApprovedComment>>();

	for (const row of rows) {
		const existing = commentsByThread.get(row.thread);

		if (existing) existing.push(row);
		else commentsByThread.set(row.thread, [row]);
	}

	return commentsByThread;
}

export async function readCommentsSnapshot(filePath: string): Promise<CommentsSnapshot> {
	return commentsSnapshotSchema.parse(JSON.parse(await readFile(filePath, 'utf8')));
}

// Local and remote pulls write separate files, so a production build never reads local data
export function toSnapshotFile(directory: string, target: SnapshotTarget): string {
	return path.join(directory, `approved-${target}.json`);
}

export async function writeCommentsSnapshot(
	store: CommentModerationStore,
	filePath: string,
): Promise<SnapshotTally> {
	const [rows, pending] = await Promise.all([store.listApproved(), store.listPending()]);
	const snapshot = { pulledAt: new Date().toISOString(), rows } satisfies CommentsSnapshot;

	await mkdir(path.dirname(filePath), { recursive: true });
	await writeFile(`${filePath}.tmp`, JSON.stringify(snapshot));
	await rename(`${filePath}.tmp`, filePath);

	return { approved: rows.length, pending: pending.length };
}
