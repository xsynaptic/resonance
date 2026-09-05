/* eslint-disable unicorn/no-null -- D1 answers and takes `null`, so the stub and the expected bindings must too */
import { afterEach, describe, expect, test, vi } from 'vitest';

import { t } from '#lib/i18n/i18n-strings.ts';
import { handleCommentSubmission } from '#worker/comments.ts';

const ipSalt = 'test-salt';

// SHA-256 of `reader@example.test` and of `test-salt203.0.113.7`, computed outside this suite
const gravatarHashOfLowercasedEmail =
	'2cecb651356e138bd83a5215c4d7c5a3ebfb923a0c316de1b218797417911c5e';
const saltedIpHash = 'c73444b80046bb2a92443cb729729d63ccd35a41c85e822a6557d6fc277cc93d';

// Bound parameter positions in the INSERT; `status` and `source` are SQL literals and take none
const columns = {
	author: 4,
	authorEmail: 5,
	authorUrl: 6,
	body: 8,
	collection: 1,
	createdAt: 9,
	entryId: 2,
	gravatarHash: 7,
	id: 0,
	ipHash: 10,
	parentId: 3,
} as const;

interface BoundStatement {
	sql: string;
	values: Array<unknown>;
}

interface EnvStub {
	env: Env;
	statements: Array<BoundStatement>;
}

interface EnvStubOptions {
	approvedParentIds?: Array<string>;
	entryPaths?: Array<string>;
	ipSalt?: string;
}

type FieldOverrides = Record<string, string | undefined>;

function createEnv({
	approvedParentIds = [],
	entryPaths = ['/mixes/voyager/'],
	ipSalt: salt = ipSalt,
}: EnvStubOptions = {}): EnvStub {
	const statements: Array<BoundStatement> = [];

	const database = {
		prepare(sql: string) {
			return {
				bind(...values: Array<unknown>) {
					statements.push({ sql, values });

					return {
						first: () => Promise.resolve(approvedParentIds.includes(String(values[0])) ? {} : null),
						run: () => Promise.resolve({}),
					};
				},
			};
		},
	};

	const assets = {
		fetch: (input: Request | string | URL) => {
			const isBuilt = entryPaths.includes(toPathname(input));

			return Promise.resolve(new Response(undefined, { status: isBuilt ? 200 : 404 }));
		},
	};

	return {
		env: { ASSETS: assets, DB: database, IP_SALT: salt, TURNSTILE_SECRET_KEY: 'secret' } as Env,
		statements,
	};
}

function makeRequest(
	overrides: FieldOverrides = {},
	headerOverrides: Record<string, string> = {},
): Request {
	const fields: FieldOverrides = {
		author: 'Reader',
		body: 'A comment worth keeping.',
		'cf-turnstile-response': 'token',
		collection: 'mixes',
		entryId: 'voyager',
		renderedAt: String(Date.now() - 5000),
		...overrides,
	};

	const body = new URLSearchParams(
		Object.entries(fields).filter(([, value]) => value !== undefined) as Array<[string, string]>,
	).toString();

	return new Request('https://example.test/api/comments', {
		body,
		headers: {
			accept: 'application/json',
			'content-length': String(new TextEncoder().encode(body).length),
			'content-type': 'application/x-www-form-urlencoded',
			...headerOverrides,
		},
		method: 'POST',
	});
}

function stubSiteverify(isVerified: boolean) {
	return vi
		.spyOn(globalThis, 'fetch')
		.mockResolvedValue(Response.json({ success: isVerified }, { status: 200 }));
}

function toPathname(input: Request | string | URL): string {
	return new URL(input instanceof Request ? input.url : input).pathname;
}

afterEach(() => {
	vi.restoreAllMocks();
});

describe('handleCommentSubmission', () => {
	test('throws when the IP salt is unset, rather than hashing against "undefined"', async () => {
		const { env } = createEnv({ ipSalt: '' });

		await expect(handleCommentSubmission(makeRequest(), env)).rejects.toThrow('IP_SALT is not set');
	});

	test('rejects a body over the size cap', async () => {
		const { env } = createEnv();
		const response = await handleCommentSubmission(makeRequest({ body: 'x'.repeat(40_000) }), env);

		expect(response.status).toBe(413);
		await expect(response.json()).resolves.toEqual({ message: t('comments.error.tooLarge') });
	});

	test('rejects a body of unknown size, which cannot be capped', async () => {
		const { env } = createEnv();
		const request = makeRequest();

		request.headers.delete('content-length');

		const response = await handleCommentSubmission(request, env);

		expect(response.status).toBe(413);
	});

	test('rejects a body that is not a form', async () => {
		const { env } = createEnv();
		const request = new Request('https://example.test/api/comments', {
			body: 'not a form',
			headers: {
				accept: 'application/json',
				'content-length': '10',
				'content-type': 'text/plain',
			},
			method: 'POST',
		});

		const response = await handleCommentSubmission(request, env);

		expect(response.status).toBe(400);
		await expect(response.json()).resolves.toEqual({ message: t('comments.error.unreadable') });
	});

	test('rejects a filled honeypot, and ignores an untouched one', async () => {
		const { env } = createEnv();
		const trapped = await handleCommentSubmission(makeRequest({ website: 'spam.test' }), env);

		expect(trapped.status).toBe(400);
		await expect(trapped.json()).resolves.toEqual({ message: t('comments.error.rejected') });

		stubSiteverify(true);

		const untouched = await handleCommentSubmission(makeRequest({ website: '  ' }), env);

		expect(untouched.status).toBe(201);
	});

	test('rejects a submission the schema will not take', async () => {
		const { env } = createEnv();
		const response = await handleCommentSubmission(makeRequest({ author: undefined }), env);

		expect(response.status).toBe(400);
		await expect(response.json()).resolves.toEqual({ message: t('comments.error.invalid') });
	});

	test('rejects an entry id outside the slug pattern before it reaches the assets binding', async () => {
		const { env } = createEnv();
		const assets = vi.spyOn(env.ASSETS, 'fetch');
		const response = await handleCommentSubmission(
			makeRequest({ entryId: '../../etc/passwd' }),
			env,
		);

		expect(response.status).toBe(400);
		await expect(response.json()).resolves.toEqual({ message: t('comments.error.invalid') });
		expect(assets).not.toHaveBeenCalled();
	});

	test('rejects a form filled in under three seconds', async () => {
		const { env } = createEnv();
		const response = await handleCommentSubmission(
			makeRequest({ renderedAt: String(Date.now() - 100) }),
			env,
		);

		expect(response.status).toBe(400);
		await expect(response.json()).resolves.toEqual({ message: t('comments.error.tooFast') });
	});

	test('rejects an entry with no built page', async () => {
		const { env } = createEnv();
		const response = await handleCommentSubmission(makeRequest({ entryId: 'no-such-mix' }), env);

		expect(response.status).toBe(400);
		await expect(response.json()).resolves.toEqual({ message: t('comments.error.entryMissing') });
	});

	test('looks a post up at the site root and a mix under its collection', async () => {
		const requested: Array<string> = [];
		const { env } = createEnv({ entryPaths: [] });

		vi.spyOn(env.ASSETS, 'fetch').mockImplementation((input) => {
			requested.push(toPathname(input));

			return Promise.resolve(new Response(undefined, { status: 404 }));
		});

		await handleCommentSubmission(makeRequest({ collection: 'posts', entryId: 'a-post' }), env);
		await handleCommentSubmission(makeRequest(), env);

		expect(requested).toEqual(['/a-post/', '/mixes/voyager/']);
	});

	test('rejects a reply whose parent is not approved on this entry', async () => {
		const { env } = createEnv();
		const response = await handleCommentSubmission(makeRequest({ parentId: 'gone' }), env);

		expect(response.status).toBe(400);
		await expect(response.json()).resolves.toEqual({ message: t('comments.error.parentMissing') });
	});

	test('accepts a reply to an approved parent', async () => {
		stubSiteverify(true);

		const { env, statements } = createEnv({ approvedParentIds: ['parent-id'] });
		const response = await handleCommentSubmission(makeRequest({ parentId: 'parent-id' }), env);

		expect(response.status).toBe(201);
		expect(statements.at(-1)?.values[columns.parentId]).toBe('parent-id');
	});

	test('rejects a submission Turnstile will not verify', async () => {
		stubSiteverify(false);

		const { env, statements } = createEnv();
		const response = await handleCommentSubmission(makeRequest(), env);

		expect(response.status).toBe(403);
		await expect(response.json()).resolves.toEqual({ message: t('comments.error.challenge') });
		expect(statements).toEqual([]);
	});

	test('never reaches siteverify on a local rejection', async () => {
		const siteverify = stubSiteverify(true);
		const { env } = createEnv();

		const rejected = [
			makeRequest({ body: 'x'.repeat(40_000) }),
			makeRequest({ website: 'spam.test' }),
			makeRequest({ author: undefined }),
			makeRequest({ renderedAt: String(Date.now() - 100) }),
			makeRequest({ entryId: 'no-such-mix' }),
			makeRequest({ parentId: 'gone' }),
		];

		for (const request of rejected) {
			const response = await handleCommentSubmission(request, env);

			expect(response.ok).toBe(false);
		}

		expect(siteverify).not.toHaveBeenCalled();
	});

	test('sends the token, the secret and the client IP to siteverify', async () => {
		const siteverify = stubSiteverify(true);
		const { env } = createEnv();

		await handleCommentSubmission(makeRequest({}, { 'CF-Connecting-IP': '203.0.113.7' }), env);

		const [url, init] = siteverify.mock.calls[0] ?? [];
		const sent = init?.body as FormData;

		expect(url).toBe('https://challenges.cloudflare.com/turnstile/v0/siteverify');
		expect(sent.get('secret')).toBe('secret');
		expect(sent.get('response')).toBe('token');
		expect(sent.get('remoteip')).toBe('203.0.113.7');
	});

	test('inserts a pending web comment and answers 201 with JSON', async () => {
		stubSiteverify(true);

		const { env, statements } = createEnv();
		const response = await handleCommentSubmission(makeRequest(), env);

		expect(response.status).toBe(201);

		const insert = statements.at(-1);

		expect(insert?.sql).toContain(`'pending', 'web'`);
		expect(insert?.values).toEqual([
			expect.stringMatching(/^[a-z2-7]{10}$/),
			'mixes',
			'voyager',
			null,
			'Reader',
			null,
			null,
			null,
			'A comment worth keeping.',
			expect.closeTo(Math.floor(Date.now() / 1000), -1),
			null,
		]);
	});

	test('stores the email as submitted, plus a Gravatar hash of its lowercased form', async () => {
		stubSiteverify(true);

		const { env, statements } = createEnv();

		await handleCommentSubmission(makeRequest({ authorEmail: 'Reader@Example.TEST' }), env);

		const values = statements.at(-1)?.values ?? [];

		expect(values[columns.authorEmail]).toBe('Reader@Example.TEST');
		expect(values[columns.gravatarHash]).toBe(gravatarHashOfLowercasedEmail);
	});

	test('stores the client IP only as a salted hash', async () => {
		stubSiteverify(true);

		const { env, statements } = createEnv();

		await handleCommentSubmission(makeRequest({}, { 'CF-Connecting-IP': '203.0.113.7' }), env);

		const values = statements.at(-1)?.values ?? [];

		expect(values[columns.ipHash]).toBe(saltedIpHash);
		expect(values).not.toContain('203.0.113.7');
	});

	test('redirects a native form post back to the entry', async () => {
		stubSiteverify(true);

		const { env } = createEnv();
		const response = await handleCommentSubmission(makeRequest({}, { accept: 'text/html' }), env);

		expect(response.status).toBe(303);
		expect(response.headers.get('location')).toBe(
			'https://example.test/mixes/voyager/?comment=received#comments',
		);
	});

	test('answers a native form post with plain text on rejection', async () => {
		const { env } = createEnv();
		const response = await handleCommentSubmission(
			makeRequest({ website: 'spam.test' }, { accept: 'text/html' }),
			env,
		);

		expect(response.headers.get('content-type')).toBe('text/plain; charset=utf-8');
		await expect(response.text()).resolves.toBe(`${t('comments.error.rejected')}\n`);
	});
});
