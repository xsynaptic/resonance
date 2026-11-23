import { readFile } from 'node:fs/promises';
import { styleText } from 'node:util';

import type { CommentModerationStore } from '#store.ts';

import { toPrintable } from '#cli/terminal.ts';
import { threadRegistrySchema } from '#registry.ts';

export interface OrphanedThread {
	approved: number;
	pending: number;
	thread: string;
}

// Rejected and spam rows are unrenderable by intent, so they are not orphans
export async function findOrphanedThreads(
	store: CommentModerationStore,
	registryFile: string,
): Promise<Array<OrphanedThread>> {
	const registry = threadRegistrySchema.parse(JSON.parse(await readFile(registryFile, 'utf8')));
	const [approved, pending] = await Promise.all([store.listApproved(), store.listPending()]);
	const orphans = new Map<string, OrphanedThread>();

	function count(thread: string, status: 'approved' | 'pending'): void {
		if (Object.hasOwn(registry, thread)) return;

		const orphan = orphans.get(thread) ?? { approved: 0, pending: 0, thread };

		orphan[status] += 1;
		orphans.set(thread, orphan);
	}

	for (const comment of approved) count(comment.thread, 'approved');
	for (const comment of pending) count(comment.thread, 'pending');

	return [...orphans.values()].toSorted(
		(left, right) =>
			right.approved + right.pending - (left.approved + left.pending) ||
			left.thread.localeCompare(right.thread),
	);
}

export function printOrphanedThreads(orphans: Array<OrphanedThread>): void {
	if (orphans.length === 0) {
		console.log(styleText('green', '✓ Every comment resolves to a page'));
		return;
	}

	console.log(styleText('yellow', `${String(orphans.length)} threads resolve to no page`));

	for (const orphan of orphans) {
		const pending =
			orphan.pending === 0 ? '' : styleText('yellow', ` · ${String(orphan.pending)} pending`);

		console.log(
			`  ${styleText('cyan', toPrintable(orphan.thread))}  ${styleText('dim', `${String(orphan.approved)} approved`)}${pending}`,
		);
	}
}
