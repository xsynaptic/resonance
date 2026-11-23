/* eslint-disable unicorn/no-null -- D1 answers and takes `null`, so the binding over SQLite must too */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { t } from '#lib/i18n/i18n-strings.ts';
import { handleComment } from '#worker/comments.ts';

type Binding = Array<null | number | string>;

// A `URL` here would be the Workers one, which Node's `readFileSync` does not accept
const migrations = ['0001-comments.sql', '0002-thread-key.sql'].map((file) =>
	readFileSync(path.join(import.meta.dirname, '../migrations/comments', file), 'utf8'),
);

const schema = readFileSync(
	createRequire(import.meta.url).resolve('@xsynaptic/astro-comments/migrations/0000-initial.sql'),
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

const registry = {
	'mixes/old-slug': { path: '/mixes/voyager/' },
	'mixes/voyager': { path: '/mixes/voyager/' },
	'posts/a-post': { path: '/a-post/' },
};

function createEnv(): Env {
	return {
		ASSETS: {
			fetch: (input: URL) =>
				Promise.resolve(
					input.pathname === '/comment-threads.json'
						? Response.json(registry)
						: new Response(undefined, { status: 404 }),
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
		formAge: '5000',
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

describe('handleComment', () => {
	test('redirects to the page the registry holds for the thread', async () => {
		stubSiteverify(true);
		migrate();

		const env = createEnv();
		const post = await handleComment(makeRequest({ thread: 'posts/a-post' }), env);
		const mix = await handleComment(makeRequest({ thread: 'mixes/voyager' }), env);

		expect(post.headers.get('location')).toBe(
			'https://example.test/a-post/?comment=received#comments',
		);
		expect(mix.headers.get('location')).toBe(
			'https://example.test/mixes/voyager/?comment=received#comments',
		);
	});

	test('refuses a thread the registry does not hold, reading the registry once', async () => {
		migrate();

		const env = createEnv();
		const assets = vi.spyOn(env.ASSETS, 'fetch');
		const about = await handleComment(makeRequest({ thread: 'pages/about' }), env);
		const missing = await handleComment(makeRequest({ thread: 'mixes/no-such-mix' }), env);

		expect(about.status).toBe(400);
		await expect(about.text()).resolves.toBe(`${t('comments.error.entryMissing')}\n`);
		expect(missing.status).toBe(400);
		expect(assets).toHaveBeenCalledOnce();
	});

	test('accepts a reply to a comment written before the rename', async () => {
		stubSiteverify(true);
		migrate([['wp-1', 'mixes', 'old-slug', null, 'approved']]);

		const response = await handleComment(
			makeRequest({ parentId: 'wp-1', thread: 'mixes/voyager' }),
			createEnv(),
		);

		expect(response.status).toBe(303);
		expect(
			database.prepare(`SELECT thread, parent_id FROM comments WHERE source = 'web'`).get(),
		).toEqual({ parent_id: 'wp-1', thread: 'mixes/voyager' });
	});

	test('stores an accepted reply under its thread with the salted IP hash', async () => {
		stubSiteverify(true);
		migrate([['wp-1', 'mixes', 'voyager', null, 'approved']]);

		const response = await handleComment(
			makeRequest({ parentId: 'wp-1', thread: 'mixes/voyager' }),
			createEnv(),
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

		await handleComment(makeRequest({ thread: 'mixes/voyager' }), createEnv());

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

		const response = await handleComment(makeRequest({ thread: 'mixes/voyager' }), createEnv());

		expect(response.status).toBe(500);
		await expect(response.text()).resolves.toBe(`${t('comments.error.unexpected')}\n`);
	});

	test('answers a failed challenge with the site copy', async () => {
		stubSiteverify(false);
		migrate();

		const response = await handleComment(makeRequest({ thread: 'mixes/voyager' }), createEnv());

		expect(response.status).toBe(403);
		await expect(response.text()).resolves.toBe(`${t('comments.error.challenge')}\n`);
		expect(database.prepare('SELECT COUNT(*) AS count FROM comments').get()).toEqual({ count: 0 });
	});
});
