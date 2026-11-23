/* eslint-disable unicorn/no-null -- D1 answers and takes `null`, so the binding over SQLite must too */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { t } from '#lib/i18n/i18n-strings.ts';
import { createD1CommentStore } from '#worker/comments-store.ts';
import { handleComment } from '#worker/comments.ts';

type Binding = Array<null | number | string>;

// A `URL` here would be the Workers one, which Node's `readFileSync` does not accept
const migrations = ['0001-comments.sql', '0002-thread-key.sql'].map((file) =>
	readFileSync(path.join(import.meta.dirname, '../migrations/comments', file), 'utf8'),
);

const schema = readFileSync(
	path.join(import.meta.dirname, '../packages/astro-comments/schema.sql'),
	'utf8',
);

const legacyRow = `INSERT INTO comments (id, collection, entry_id, parent_id, author, gravatar_hash, body, status, source, created_at, wp_post_id)
VALUES (?, ?, ?, ?, 'Reader', 'a-hash', 'An old comment.', ?, 'wordpress', 1577836800, 42)`;

let database: DatabaseSync;

beforeEach(() => {
	database = new DatabaseSync(':memory:');
});

afterEach(() => {
	database.close();
	vi.restoreAllMocks();
});

function migrate(legacyRows: Array<Binding> = []): void {
	const [initial = '', threadKey = ''] = migrations;

	database.exec(initial);

	for (const row of legacyRows) database.prepare(legacyRow).run(...row);

	database.exec(threadKey);
}

function createBinding() {
	return {
		prepare: (sql: string) => {
			const statement = database.prepare(sql);

			return {
				bind: (...values: Binding) => ({
					first: () => Promise.resolve(statement.get(...values) ?? null),
					run: () => Promise.resolve(statement.run(...values)),
				}),
			};
		},
	};
}

function createEnv(builtPaths: Array<string>): Env {
	return {
		ASSETS: {
			fetch: (input: URL) =>
				Promise.resolve(
					new Response(undefined, { status: builtPaths.includes(input.pathname) ? 200 : 404 }),
				),
		},
		DB: createBinding(),
		IP_SALT: 'test-salt',
		TURNSTILE_SECRET_KEY: 'secret',
	} as unknown as Env;
}

function makeRequest(fields: Record<string, string>): Request {
	const body = new URLSearchParams({
		author: 'Reader',
		body: 'A comment worth keeping.',
		'cf-turnstile-response': 'token',
		renderedAt: String(Date.now() - 5000),
		...fields,
	}).toString();

	return new Request('https://example.test/api/comments', {
		body,
		headers: {
			accept: 'text/html',
			'CF-Connecting-IP': '203.0.113.7',
			'content-length': String(new TextEncoder().encode(body).length),
			'content-type': 'application/x-www-form-urlencoded',
		},
		method: 'POST',
	});
}

function stubSiteverify(isVerified: boolean) {
	return vi
		.spyOn(globalThis, 'fetch')
		.mockImplementation(() => Promise.resolve(Response.json({ success: isVerified })));
}

describe('the thread key migration', () => {
	test('keys every row by its collection and entry, and keeps everything else', () => {
		migrate([
			['wp-1', 'mixes', 'voyager', null, 'approved'],
			['wp-2', 'posts', 'a-post', 'wp-1', 'pending'],
		]);

		expect(database.prepare('SELECT * FROM comments ORDER BY id').all()).toEqual([
			{
				author: 'Reader',
				author_email: null,
				author_url: null,
				body: 'An old comment.',
				created_at: 1_577_836_800,
				email_hash: 'a-hash',
				id: 'wp-1',
				ip_hash: null,
				is_owner: 0,
				parent_id: null,
				source: 'wordpress',
				status: 'approved',
				thread: 'mixes/voyager',
			},
			{
				author: 'Reader',
				author_email: null,
				author_url: null,
				body: 'An old comment.',
				created_at: 1_577_836_800,
				email_hash: 'a-hash',
				id: 'wp-2',
				ip_hash: null,
				is_owner: 0,
				parent_id: 'wp-1',
				source: 'wordpress',
				status: 'pending',
				thread: 'posts/a-post',
			},
		]);
	});

	test("marks only Basilisk's comments as the Owner's", () => {
		migrate([
			['wp-134', 'posts', 'a-post', null, 'approved'],
			['wp-135', 'posts', 'a-post', null, 'approved'],
		]);

		expect(database.prepare('SELECT id, is_owner FROM comments ORDER BY id').all()).toEqual([
			{ id: 'wp-134', is_owner: 1 },
			{ id: 'wp-135', is_owner: 0 },
		]);
	});

	test('refuses a status outside the four', () => {
		migrate();

		expect(() => {
			database.exec(
				`INSERT INTO comments (id, thread, author, body, status, created_at) VALUES ('x', 'posts/a-post', 'Reader', 'A comment.', 'deleted', 0)`,
			);
		}).toThrow('CHECK constraint failed');
	});

	test('builds the table and indexes of the package schema, and nothing on the old columns', () => {
		migrate();

		const fresh = new DatabaseSync(':memory:');
		const tableSql = `SELECT type, name, sql FROM sqlite_master WHERE tbl_name = 'comments' ORDER BY name`;

		fresh.exec(schema);

		expect(database.prepare(tableSql).all()).toEqual(fresh.prepare(tableSql).all());

		fresh.close();
	});
});

describe('the D1 comment store', () => {
	test('finds a parent only when it is approved on the same thread', async () => {
		migrate([
			['approved-here', 'mixes', 'voyager', null, 'approved'],
			['pending-here', 'mixes', 'voyager', null, 'pending'],
			['approved-elsewhere', 'mixes', 'other', null, 'approved'],
		]);

		const store = createD1CommentStore(createBinding());

		await expect(store.hasApprovedParent('mixes/voyager', 'approved-here')).resolves.toBe(true);
		await expect(store.hasApprovedParent('mixes/voyager', 'pending-here')).resolves.toBe(false);
		await expect(store.hasApprovedParent('mixes/voyager', 'approved-elsewhere')).resolves.toBe(
			false,
		);
		await expect(store.hasApprovedParent('mixes/voyager', 'missing')).resolves.toBe(false);
	});

	test("inserts a pending web comment, never the Owner's, with SQL NULL for every absent field", async () => {
		migrate();

		await createD1CommentStore(createBinding()).insert({
			author: 'Reader',
			body: 'A comment worth keeping.',
			createdAt: 1_763_899_200,
			id: 'k7d2mqzx4a',
			thread: 'mixes/voyager',
		});

		expect(database.prepare('SELECT * FROM comments').all()).toEqual([
			{
				author: 'Reader',
				author_email: null,
				author_url: null,
				body: 'A comment worth keeping.',
				created_at: 1_763_899_200,
				email_hash: null,
				id: 'k7d2mqzx4a',
				ip_hash: null,
				is_owner: 0,
				parent_id: null,
				source: 'web',
				status: 'pending',
				thread: 'mixes/voyager',
			},
		]);
	});

	test('writes each field to its own column', async () => {
		migrate();

		await createD1CommentStore(createBinding()).insert({
			author: 'Reader',
			authorEmail: 'reader@example.test',
			authorUrl: 'https://example.test/',
			body: 'A reply.',
			createdAt: 1_763_899_200,
			emailHash: 'email-hash',
			id: 'k7d2mqzx4a',
			ipHash: 'ip-hash',
			parentId: 'wp-1',
			thread: 'posts/a-post',
		});

		expect(database.prepare('SELECT * FROM comments').get()).toMatchObject({
			author_email: 'reader@example.test',
			author_url: 'https://example.test/',
			email_hash: 'email-hash',
			ip_hash: 'ip-hash',
			parent_id: 'wp-1',
			thread: 'posts/a-post',
		});
	});
});

describe('handleComment', () => {
	test('looks a post up at the site root and a mix under its collection', async () => {
		stubSiteverify(true);
		migrate();

		const env = createEnv(['/a-post/', '/mixes/voyager/']);
		const post = await handleComment(makeRequest({ thread: 'posts/a-post' }), env);
		const mix = await handleComment(makeRequest({ thread: 'mixes/voyager' }), env);

		expect(post.headers.get('location')).toBe(
			'https://example.test/a-post/?comment=received#comments',
		);
		expect(mix.headers.get('location')).toBe(
			'https://example.test/mixes/voyager/?comment=received#comments',
		);
	});

	test('refuses a thread outside the commented collections without a page lookup', async () => {
		migrate();

		const env = createEnv(['/pages/about/']);
		const assets = vi.spyOn(env.ASSETS, 'fetch');
		const response = await handleComment(makeRequest({ thread: 'pages/about' }), env);

		expect(response.status).toBe(400);
		await expect(response.text()).resolves.toBe(`${t('comments.error.entryMissing')}\n`);
		expect(assets).not.toHaveBeenCalled();
	});

	test('stores an accepted reply under its thread with the salted IP hash', async () => {
		stubSiteverify(true);
		migrate([['wp-1', 'mixes', 'voyager', null, 'approved']]);

		const response = await handleComment(
			makeRequest({ parentId: 'wp-1', thread: 'mixes/voyager' }),
			createEnv(['/mixes/voyager/']),
		);

		expect(response.status).toBe(303);
		expect(
			database
				.prepare(`SELECT thread, parent_id, ip_hash FROM comments WHERE source = 'web'`)
				.get(),
		).toEqual({
			ip_hash: 'c73444b80046bb2a92443cb729729d63ccd35a41c85e822a6557d6fc277cc93d',
			parent_id: 'wp-1',
			thread: 'mixes/voyager',
		});
	});

	test('sends the token, the secret and the client IP to siteverify', async () => {
		const siteverify = stubSiteverify(true);

		migrate();

		await handleComment(makeRequest({ thread: 'mixes/voyager' }), createEnv(['/mixes/voyager/']));

		const [url, init] = siteverify.mock.calls[0] ?? [];
		const sent = init?.body as FormData;

		expect(url).toBe('https://challenges.cloudflare.com/turnstile/v0/siteverify');
		expect(sent.get('secret')).toBe('secret');
		expect(sent.get('response')).toBe('token');
		expect(sent.get('remoteip')).toBe('203.0.113.7');
	});

	test('answers a siteverify outage as a server error, not a failed challenge', async () => {
		vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(undefined, { status: 503 }));
		vi.spyOn(console, 'error').mockImplementation(vi.fn());
		migrate();

		const response = await handleComment(
			makeRequest({ thread: 'mixes/voyager' }),
			createEnv(['/mixes/voyager/']),
		);

		expect(response.status).toBe(500);
		await expect(response.text()).resolves.toBe(`${t('comments.error.unexpected')}\n`);
	});

	test('answers a failed challenge with the site copy', async () => {
		stubSiteverify(false);
		migrate();

		const response = await handleComment(
			makeRequest({ thread: 'mixes/voyager' }),
			createEnv(['/mixes/voyager/']),
		);

		expect(response.status).toBe(403);
		await expect(response.text()).resolves.toBe(`${t('comments.error.challenge')}\n`);
		expect(database.prepare('SELECT COUNT(*) AS count FROM comments').get()).toEqual({ count: 0 });
	});
});
