import type { ContentEntry } from '@xsynaptic/astro-scripts';

import {
	getCollectionEntries,
	log,
	readChild,
	withAstroContent,
	withSpinner,
} from '@xsynaptic/astro-scripts';
import { queryComments } from '@xsynaptic/shared/comments';
import chalk from 'chalk';

import { toFormerIds } from '#shared/entries.ts';

export interface OrphansOptions {
	isLocal: boolean;
	rootPath: string;
}

interface EntryGroup {
	approved: number;
	collection: string;
	entryId: string;
	pending: number;
}

interface GroupRow {
	collection: string;
	entry_id: string;
	pending: number;
	total: number;
}

// Rejected and spam rows are unrenderable by intent, so they are not orphans
const groupQuery = `
	SELECT collection, entry_id,
		COUNT(*) AS total,
		SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) AS pending
	FROM comments
	WHERE status IN ('approved', 'pending')
	GROUP BY collection, entry_id
	ORDER BY collection, entry_id
`;

const commentedCollections = ['mixes', 'posts', 'reviews'] as const;

export async function reportOrphans(options: OrphansOptions): Promise<void> {
	const { isLocal, rootPath } = options;

	const rows = await queryComments<GroupRow>(groupQuery, { cwd: rootPath, isLocal });

	const entries = await withSpinner('Loading content', async () => {
		// Which entries exist is the whole question, so the store is resynced rather than trusted
		await readChild(['pnpm', 'exec', 'astro', 'sync'], { cwd: rootPath });

		return withAstroContent((content) => getCollectionEntries(content, [...commentedCollections]));
	});
	const resolvable = collectResolvableIds(entries);

	const orphans: Array<EntryGroup> = rows
		.filter((row) => !resolvable.has(`${row.collection}/${row.entry_id}`))
		.map((row) => ({
			approved: row.total - row.pending,
			collection: row.collection,
			entryId: row.entry_id,
			pending: row.pending,
		}));

	if (orphans.length === 0) {
		log.success('Every comment resolves to an entry');
		return;
	}

	const total = orphans.reduce((sum, group) => sum + group.approved + group.pending, 0);

	log.warn(`${String(total)} orphaned comments on ${String(orphans.length)} unresolvable entries`);

	for (const group of orphans.toSorted(byCountDescending)) log.data(group, formatGroup);

	log.detail('These wait in D1 until the entry is published or lists the slug in `formerIds`');
}

function byCountDescending(left: EntryGroup, right: EntryGroup): number {
	const difference = right.approved + right.pending - (left.approved + left.pending);

	if (difference !== 0) return difference;

	return `${left.collection}/${left.entryId}`.localeCompare(`${right.collection}/${right.entryId}`);
}

function formatGroup(group: EntryGroup): string {
	const counts = [
		`${String(group.approved)} approved`,
		group.pending === 0 ? undefined : chalk.yellow(`${String(group.pending)} pending`),
	].filter((part) => part !== undefined);

	return `${chalk.cyan(`${group.collection}/${group.entryId}`)}  ${chalk.dim(counts.join(' · '))}`;
}

// Drafts never reach the content store, so their comments read as orphaned until the draft is published
function collectResolvableIds(entries: Array<ContentEntry>): Set<string> {
	return new Set(
		entries.flatMap((entry) => [
			`${entry.collection}/${entry.id}`,
			...toFormerIds(entry).map((formerId) => `${entry.collection}/${formerId}`),
		]),
	);
}
