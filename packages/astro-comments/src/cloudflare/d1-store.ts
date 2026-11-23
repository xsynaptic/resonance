import { z } from 'zod';

import type { CommentModerationStore, CommentStore, NewComment, StoredComment } from '#store.ts';

import { approvedCommentSchema } from '#schemas.ts';
import { storedCommentSchema } from '#store.ts';

// Structural, so no Cloudflare types are needed and a test can drive SQLite through it
export interface D1Binding {
	prepare: (sql: string) => D1Statement;
}

export interface D1Statement {
	all: () => Promise<{ results: Array<unknown> }>;
	bind: (...values: Array<null | number | string>) => D1Statement;
	first: () => Promise<unknown>;
	run: () => Promise<{ meta: { changes: number } }>;
}

// D1 caps a statement at 100 bound parameters, and the new value takes one
const maximumIdsPerUpdate = 99;

const storedColumns =
	'id, thread, parent_id, author, author_email, author_url, body, created_at, is_owner, source, status';

const insertComment = `INSERT INTO comments (id, thread, parent_id, author, author_email, author_url, email_hash, body, status, source, created_at, ip_hash)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', 'web', ?, ?)`;

const selectApprovedParent = `SELECT thread FROM comments WHERE id = ? AND status = 'approved'`;

const selectApproved = `SELECT id, thread, parent_id, author, author_url, email_hash, is_owner, body, created_at
FROM comments WHERE status = 'approved' ORDER BY thread, created_at`;

const selectPending = `SELECT ${storedColumns} FROM comments WHERE status = 'pending' ORDER BY created_at`;

const selectComment = `SELECT ${storedColumns} FROM comments WHERE id = ?`;

const deletionStatement = `DELETE FROM comments WHERE id = ? RETURNING ${storedColumns}`;

const fieldsByColumn: Record<string, string> = {
	author_email: 'authorEmail',
	author_url: 'authorUrl',
	created_at: 'createdAt',
	email_hash: 'emailHash',
	is_owner: 'isOwner',
	parent_id: 'parentId',
};

const parentRowSchema = z.object({ thread: z.string() });

export function createD1CommentStore(database: D1Binding): CommentModerationStore & CommentStore {
	return {
		async deleteComment(id) {
			return toStoredComment(await database.prepare(deletionStatement).bind(id).first());
		},
		async findApprovedParent(parentId) {
			const row = await database.prepare(selectApprovedParent).bind(parentId).first();

			return row === null ? undefined : parentRowSchema.parse(row).thread;
		},
		async getComment(id) {
			return toStoredComment(await database.prepare(selectComment).bind(id).first());
		},
		async insert(comment) {
			await database
				.prepare(insertComment)
				.bind(...toInsertValues(comment))
				.run();
		},
		async listApproved() {
			const { results } = await database.prepare(selectApproved).all();

			return results.map((row) => approvedCommentSchema.parse(toFields(row)));
		},
		async listPending() {
			const { results } = await database.prepare(selectPending).all();

			return results.map((row) => toStoredComment(row)).filter((row) => row !== undefined);
		},
		setOwner: (ids, isOwner) => updateInBatches(database, ids, ['is_owner', isOwner ? 1 : 0]),
		setStatus: (ids, status) => updateInBatches(database, ids, ['status', status]),
	};
}

async function updateInBatches(
	database: D1Binding,
	ids: Array<string>,
	[column, value]: ['is_owner' | 'status', number | string],
): Promise<number> {
	let changes = 0;

	for (let start = 0; start < ids.length; start += maximumIdsPerUpdate) {
		const batch = ids.slice(start, start + maximumIdsPerUpdate);
		const placeholders = batch.map(() => '?').join(', ');
		const result = await database
			.prepare(`UPDATE comments SET ${column} = ? WHERE id IN (${placeholders})`)
			.bind(value, ...batch)
			.run();

		changes += result.meta.changes;
	}

	return changes;
}

function toInsertValues(comment: NewComment): Array<null | number | string> {
	return [
		comment.id,
		comment.thread,
		toNullable(comment.parentId),
		comment.author,
		toNullable(comment.authorEmail),
		toNullable(comment.authorUrl),
		toNullable(comment.emailHash),
		comment.body,
		comment.createdAt,
		toNullable(comment.ipHash),
	];
}

function toNullable(value: string | undefined): null | string {
	// eslint-disable-next-line unicorn/no-null -- D1 takes `null` for a SQL NULL; `undefined` is not a valid bound parameter
	return value ?? null;
}

function toFields(row: unknown): Record<string, unknown> {
	const fields: Record<string, unknown> = {};

	if (typeof row !== 'object' || row === null) return fields;

	for (const [column, value] of Object.entries(row)) {
		if (value === null) continue;

		fields[fieldsByColumn[column] ?? column] = column === 'is_owner' ? value === 1 : value;
	}

	return fields;
}

function toStoredComment(row: unknown): StoredComment | undefined {
	if (row === null) return undefined;

	return storedCommentSchema.parse(toFields(row));
}
