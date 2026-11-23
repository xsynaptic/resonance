import path from 'node:path';
import { styleText } from 'node:util';

import type { CommentsConfig } from '#cli/define-config.ts';
import type { ModerationTally } from '#cli/moderation-queue.ts';
import type { SnapshotTally, SnapshotTarget } from '#snapshot/snapshot.ts';
import type { CommentModerationStore, StoredComment } from '#store.ts';

import { openCommentStore } from '#cli/config.ts';
import { runModerationQueue } from '#cli/moderation-queue.ts';
import { findOrphanedThreads, printOrphanedThreads } from '#cli/orphans.ts';
import { printComment, readKey } from '#cli/terminal.ts';
import { toSnapshotFile, writeCommentsSnapshot } from '#snapshot/snapshot.ts';

export async function deleteComment(
	config: CommentsConfig,
	target: SnapshotTarget,
	id: string,
): Promise<StoredComment | undefined> {
	const removed = await withStore(config, target, async (store) => {
		const comment = await store.getComment(id);

		if (!comment) {
			console.log(styleText('yellow', `No comment with id ${id}`));
			return;
		}

		printComment(comment, styleText('dim', comment.status));
		console.log(
			`  ${styleText(['red', 'bold'], 'Delete permanently?')}  ${styleText('dim', 'y / n')}`,
		);

		if ((await readKey(['y', 'n'])) !== 'y') {
			console.log(styleText('dim', 'Kept'));
			return;
		}

		const deleted = await store.deleteComment(id);

		console.log(styleText('green', `✓ Deleted ${id}`));

		return deleted;
	});

	if (removed?.status === 'approved') await pullComments(config, target);

	return removed;
}

// The site reads a snapshot, so an approval reaches it only after a pull
export async function moderateComments(
	config: CommentsConfig,
	target: SnapshotTarget,
): Promise<ModerationTally> {
	const tally = await withStore(config, target, async (store) => {
		console.log(styleText('bold', `Moderation queue · ${target}`));

		return runModerationQueue(store, config.ownerEmails);
	});

	console.log(
		styleText(
			'dim',
			`Approved ${String(tally.approved)} · rejected ${String(tally.rejected)} · spam ${String(tally.spam)} · skipped ${String(tally.skipped)}`,
		),
	);

	if (tally.approved > 0) await pullComments(config, target);

	return tally;
}

export async function reportOrphans(config: CommentsConfig, target: SnapshotTarget): Promise<void> {
	const orphans = await withStore(config, target, (store) =>
		findOrphanedThreads(store, config.threadRegistry),
	);

	printOrphanedThreads(orphans);
}

export async function pullComments(
	config: CommentsConfig,
	target: SnapshotTarget,
): Promise<SnapshotTally> {
	const filePath = toSnapshotFile(config.snapshotDirectory, target);
	const tally = await withStore(config, target, (store) => writeCommentsSnapshot(store, filePath));

	console.log(
		styleText(
			'green',
			`✓ ${String(tally.approved)} approved comments written to ${path.relative(process.cwd(), filePath)}`,
		),
	);

	if (tally.pending > 0) console.log(styleText('yellow', `${String(tally.pending)} pending`));

	return tally;
}

async function withStore<Result>(
	config: CommentsConfig,
	target: SnapshotTarget,
	run: (store: CommentModerationStore) => Promise<Result>,
): Promise<Result> {
	const { dispose, store } = await openCommentStore(config, target);

	try {
		return await run(store);
	} finally {
		await dispose();
	}
}
