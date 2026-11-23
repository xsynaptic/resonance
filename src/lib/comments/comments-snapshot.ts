import type { ApprovedComment } from '@xsynaptic/astro-comments';

import { readCommentsByThread, toSnapshotFile } from '@xsynaptic/astro-comments/snapshot';
import path from 'node:path';
import pMemoize from 'p-memoize';

import commentsConfig from '#astro-comments.config.ts';

const snapshotFile = toSnapshotFile(
	path.resolve(commentsConfig.snapshotDirectory),
	process.env.COMMENTS_D1_LOCAL === '1' ? 'local' : 'remote',
);

// Read once per process, so a fresh pull needs a dev restart
export const readSnapshotByThread = pMemoize(readOrWarn);

// A build fails without a snapshot; dev warns instead, so a fresh clone still works
async function readOrWarn(): Promise<Map<string, Array<ApprovedComment>>> {
	try {
		return await readCommentsByThread(snapshotFile);
	} catch (error) {
		const message = `No usable comment snapshot at ${snapshotFile} (${String(error)}); run \`pnpm comments pull\``;

		if (import.meta.env.PROD) throw new Error(message, { cause: error });

		console.warn(message);

		return new Map();
	}
}
