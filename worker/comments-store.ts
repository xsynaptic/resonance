import type { CommentStore, NewComment } from '@xsynaptic/astro-comments';

// Structural, so no Cloudflare types are needed and a test can drive SQLite through it
export interface D1Binding {
	prepare: (sql: string) => {
		bind: (...values: Array<null | number | string>) => {
			first: () => Promise<unknown>;
			run: () => Promise<unknown>;
		};
	};
}

const insertComment = `INSERT INTO comments (id, thread, parent_id, author, author_email, author_url, email_hash, body, status, source, created_at, ip_hash)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', 'web', ?, ?)`;

const selectApprovedParent = `SELECT id FROM comments WHERE id = ? AND thread = ? AND status = 'approved'`;

export function createD1CommentStore(database: D1Binding): CommentStore {
	return {
		async hasApprovedParent(thread, parentId) {
			const parent = await database.prepare(selectApprovedParent).bind(parentId, thread).first();

			return parent !== null;
		},
		async insert(comment) {
			await database
				.prepare(insertComment)
				.bind(...toInsertValues(comment))
				.run();
		},
	};
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
