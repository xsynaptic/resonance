import type { CommentRow } from '@xsynaptic/shared/comments';
import type { AstroIntegrationLogger } from 'astro';
import type { Loader } from 'astro/loaders';

import { queryComments } from '@xsynaptic/shared/comments';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

type ApprovedRow = Pick<
	CommentRow,
	| 'author'
	| 'author_url'
	| 'body'
	| 'collection'
	| 'created_at'
	| 'entry_id'
	| 'gravatar_hash'
	| 'id'
	| 'parent_id'
>;

const approvedQuery = `
	SELECT id, collection, entry_id, parent_id, author, author_url, gravatar_hash, body, created_at
	FROM comments
	WHERE status = 'approved'
	ORDER BY collection, entry_id, created_at
`;

const isLocalDatabase = process.env.COMMENTS_D1_LOCAL === '1';

// Read only when D1 is unreachable, so the quality gate still runs offline; never committed
// Scoped by target, so a local run cannot leave its own corpus behind for a remote build
const cachePath = `./node_modules/.cache/comments/approved-${isLocalDatabase ? 'local' : 'remote'}.json`;

// `entry_id` is the slug a comment was written against; the read path resolves it to an entry
export function commentsLoader(): Loader {
	return {
		load: async (context) => {
			const { logger, store } = context;

			store.clear();

			const rows = await readApprovedRows(logger);

			for (const group of groupRows(rows).values()) {
				const [first] = group;

				if (!first) continue;

				const id = `${first.collection}/${first.entry_id}`;

				const data = await context.parseData({
					data: {
						collection: first.collection,
						comments: group.map((row) => toComment(row)),
						entryId: first.entry_id,
					},
					id,
				});

				store.set({ data, digest: context.generateDigest(data), id });
			}
		},
		name: 'comments-loader',
	};
}

function groupRows(rows: Array<ApprovedRow>): Map<string, Array<ApprovedRow>> {
	const grouped = new Map<string, Array<ApprovedRow>>();

	for (const row of rows) {
		const key = `${row.collection}/${row.entry_id}`;
		const existing = grouped.get(key);

		if (existing) existing.push(row);
		else grouped.set(key, [row]);
	}

	return grouped;
}

async function readApprovedRows(logger: AstroIntegrationLogger): Promise<Array<ApprovedRow>> {
	const rows = await tryQueryApproved(logger);

	if (!rows) return readCache();

	await writeCache(rows);

	return rows;
}

async function readCache(): Promise<Array<ApprovedRow>> {
	try {
		return JSON.parse(await readFile(path.resolve(cachePath), 'utf8')) as Array<ApprovedRow>;
	} catch {
		throw new Error(`D1 is unreachable and there is no comment cache at ${cachePath}`);
	}
}

function toComment(row: ApprovedRow) {
	return {
		author: row.author,
		authorUrl: row.author_url,
		body: row.body,
		date: new Date(row.created_at * 1000).toISOString(),
		gravatarHash: row.gravatar_hash,
		id: row.id,
		parentId: row.parent_id,
	};
}

async function tryQueryApproved(
	logger: AstroIntegrationLogger,
): Promise<Array<ApprovedRow> | undefined> {
	try {
		return await queryComments<ApprovedRow>(approvedQuery, { isLocal: isLocalDatabase });
	} catch (error) {
		logger.warn(
			`D1 is unreachable (${String(error)}); falling back to the last cached comments, which may be stale`,
		);

		return undefined;
	}
}

async function writeCache(rows: Array<ApprovedRow>): Promise<void> {
	const filePath = path.resolve(cachePath);

	await mkdir(path.dirname(filePath), { recursive: true });
	await writeFile(filePath, JSON.stringify(rows));
}
