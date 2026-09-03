import { astroCacheDir } from '@xsynaptic/shared/constants';
import chalk from 'chalk';
import fs from 'node:fs/promises';
import path from 'node:path';
import { $ } from 'zx';

import { getDataStoreCollection, loadDataStore } from '../shared/data-store.js';

// Pages are absent by design: they never grow a comments section
const commentCollections = ['mixes', 'posts', 'reviews'];

const databaseName = 'resonance-comments';

const projectionPath = path.join('packages', 'content', 'data', 'comments');

const approvedQuery =
	"SELECT id, collection, entry_id, parent_id, author, author_url, gravatar_hash, body, created_at FROM comments WHERE status = 'approved' ORDER BY collection, entry_id, created_at";

interface ApprovedRow {
	author: string;
	author_url: null | string;
	body: string;
	collection: string;
	created_at: number;
	entry_id: string;
	gravatar_hash: null | string;
	id: string;
	parent_id: null | string;
}

// The slug an entry answers to today, which a historical `entry_id` resolves to
interface EntryTarget {
	collection: string;
	id: string;
}

interface ProjectedComment {
	author: string;
	authorUrl: null | string;
	body: string;
	date: string;
	gravatarHash: null | string;
	id: string;
	parentId: null | string;
}

interface ProjectionOptions {
	isLocal?: boolean;
	rootPath: string;
}

interface ProjectionResult {
	documents: number;
	orphans: Map<string, number>;
	rows: number;
}

export async function rebuildProjection(options: ProjectionOptions): Promise<void> {
	const { isLocal = false, rootPath } = options;

	console.log(
		chalk.blue(`Rebuilding the comment projection from ${isLocal ? 'local' : 'remote'} D1`),
	);

	const targets = loadEntryTargets(rootPath);
	const rows = await queryApproved(rootPath, isLocal);
	const result = await writeProjection(rootPath, rows, targets);

	printSummary(result, targets.size);
}

function addTarget(targets: Map<string, EntryTarget>, id: string, target: EntryTarget): void {
	const existing = targets.get(id);

	if (existing) {
		throw new Error(
			`Slug "${id}" resolves to both ${existing.collection}/${existing.id} and ${target.collection}/${target.id}; the comment projection needs it unique.`,
		);
	}

	targets.set(id, target);
}

function compareStrings(left: string, right: string): number {
	return left.localeCompare(right);
}

function groupByTarget(
	rows: Array<ApprovedRow>,
	targets: Map<string, EntryTarget>,
	orphans: Map<string, number>,
): Map<string, Array<ApprovedRow>> {
	const grouped = new Map<string, Array<ApprovedRow>>();

	for (const row of rows) {
		const target = targets.get(row.entry_id);

		if (!target) {
			const key = `${row.collection}/${row.entry_id}`;

			orphans.set(key, (orphans.get(key) ?? 0) + 1);
			continue;
		}

		const key = `${target.collection}/${target.id}`;
		const existing = grouped.get(key);

		if (existing) existing.push(row);
		else grouped.set(key, [row]);
	}

	return grouped;
}

// Current and former ids alike; bare-slug uniqueness is the invariant Selections already relies on
function loadEntryTargets(rootPath: string): Map<string, EntryTarget> {
	const collections = loadDataStore(path.resolve(rootPath, astroCacheDir, 'data-store.json'));
	const targets = new Map<string, EntryTarget>();

	for (const collection of commentCollections) {
		const entries = getDataStoreCollection(collections, [collection]);

		for (const entry of entries) {
			const target = { collection, id: entry.id };

			addTarget(targets, entry.id, target);

			for (const formerId of toFormerIds(entry.data.formerIds)) {
				addTarget(targets, formerId, target);
			}
		}
	}

	return targets;
}

function printSummary(result: ProjectionResult, targetCount: number): void {
	console.log(chalk.gray(`  Entries known:  ${String(targetCount)}`));
	console.log(chalk.gray(`  Approved rows:  ${String(result.rows)}`));
	console.log(chalk.gray(`  Documents:      ${String(result.documents)}`));
	console.log(chalk.gray(`  Written to:     ${projectionPath}`));

	if (result.orphans.size === 0) return;

	const orphanRows = result.orphans.values().reduce((total, count) => total + count, 0);
	const sorted = [...result.orphans].sort(([left], [right]) => compareStrings(left, right));

	console.log(
		chalk.yellow(
			`  ${String(orphanRows)} comments on ${String(result.orphans.size)} unpublished or unknown entries stay in D1:`,
		),
	);

	for (const [key, count] of sorted) {
		console.log(chalk.yellow(`    ${key} (${String(count)})`));
	}
}

async function queryApproved(rootPath: string, isLocal: boolean): Promise<Array<ApprovedRow>> {
	const scope = isLocal ? '--local' : '--remote';

	const { stdout } = await $({
		cwd: rootPath,
	})`pnpm exec wrangler d1 execute ${databaseName} ${scope} --json --command ${approvedQuery}`;

	const parsed = JSON.parse(stdout) as Array<{ results: Array<ApprovedRow> }>;

	return parsed.flatMap((result) => result.results);
}

function toFormerIds(value: unknown): Array<string> {
	if (!Array.isArray(value)) return [];

	return value.filter((id: unknown) => typeof id === 'string');
}

function toProjectedComment(row: ApprovedRow): ProjectedComment {
	return {
		author: row.author,
		authorUrl: row.author_url,
		body: row.body,
		date: new Date(row.created_at * 1000).toISOString().replace('.000Z', 'Z'),
		gravatarHash: row.gravatar_hash,
		id: row.id,
		parentId: row.parent_id,
	};
}

// Deleted first, so a rejection or a rename never leaves a stale document behind
async function writeProjection(
	rootPath: string,
	rows: Array<ApprovedRow>,
	targets: Map<string, EntryTarget>,
): Promise<ProjectionResult> {
	const orphans = new Map<string, number>();
	const grouped = groupByTarget(rows, targets, orphans);
	const rootDirectory = path.join(rootPath, projectionPath);

	await fs.rm(rootDirectory, { force: true, recursive: true });

	for (const [key, group] of grouped) {
		const [collection, entryId] = key.split('/', 2);
		const filePath = path.join(rootDirectory, `${key}.json`);

		const document = {
			collection,
			comments: group.map((row) => toProjectedComment(row)),
			entryId,
		};

		await fs.mkdir(path.dirname(filePath), { recursive: true });
		await fs.writeFile(filePath, `${JSON.stringify(document, undefined, '\t')}\n`);
	}

	return { documents: grouped.size, orphans, rows: rows.length };
}
