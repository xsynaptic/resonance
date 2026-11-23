import type { CommentsConfig } from '@xsynaptic/astro-comments/cli';

import { openCommentStore } from '@xsynaptic/astro-comments/cli';
import { D1UnavailableError } from '@xsynaptic/astro-comments/cloudflare/node';
import {
	readCommentsSnapshot,
	toSnapshotFile,
	writeCommentsSnapshot,
} from '@xsynaptic/astro-comments/snapshot';
import { formatError, log, withStep } from '@xsynaptic/astro-scripts';

// Only an outage keeps the old snapshot; a bad token, id or row fails the deploy
export function pullCommentsForDeploy(config: CommentsConfig): Promise<number | undefined> {
	const filePath = toSnapshotFile(config.snapshotDirectory, 'remote');

	return withStep('Pulling remote comments', async (step) => {
		try {
			const { dispose, store } = await openCommentStore(config, 'remote');

			try {
				const tally = await writeCommentsSnapshot(store, filePath);

				log.success(`${String(tally.approved)} approved comments`);

				if (tally.pending > 0) log.warn(`${String(tally.pending)} pending`);

				return tally.pending;
			} finally {
				await dispose();
			}
		} catch (error) {
			if (!(error instanceof D1UnavailableError)) throw error;

			step.warn(await describeStaleSnapshot(filePath, error));
			return;
		}
	});
}

// Warn only: the build fails on its own when there is no snapshot to read
async function describeStaleSnapshot(filePath: string, error: unknown): Promise<string> {
	try {
		const snapshot = await readCommentsSnapshot(filePath);

		return `D1 is unreachable (${formatError(error)}); building from the snapshot pulled at ${snapshot.pulledAt}`;
	} catch {
		return `D1 is unreachable (${formatError(error)}) and there is no snapshot at ${filePath}`;
	}
}
