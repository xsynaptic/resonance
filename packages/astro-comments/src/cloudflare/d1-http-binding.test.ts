import { afterEach, describe, expect, test, vi } from 'vitest';

import { createD1HttpBinding, D1UnavailableError } from '#cloudflare/d1-http-binding.ts';

const binding = createD1HttpBinding({
	accountId: 'account',
	apiToken: 'token',
	databaseId: 'database',
});

afterEach(() => {
	vi.restoreAllMocks();
});

function stubQuery(body: unknown, status = 200) {
	return vi
		.spyOn(globalThis, 'fetch')
		.mockImplementation(() => Promise.resolve(Response.json(body, { status })));
}

function answer(result: Record<string, unknown>) {
	return { errors: [], messages: [], result: [{ success: true, ...result }], success: true };
}

describe('the D1 HTTP binding', () => {
	test('posts the statement with its parameters as strings, under the bearer token', async () => {
		const fetchSpy = stubQuery(answer({ results: [] }));

		await binding.prepare('SELECT ? AS id, ? AS at').bind('wp-1', 42).all();

		const [url, init] = fetchSpy.mock.calls[0] ?? [];

		expect(url).toBe(
			'https://api.cloudflare.com/client/v4/accounts/account/d1/database/database/query',
		);
		expect(new Headers(init?.headers).get('authorization')).toBe('Bearer token');
		expect(JSON.parse(init?.body as string)).toEqual({
			params: ['wp-1', '42'],
			sql: 'SELECT ? AS id, ? AS at',
		});
	});

	test('answers rows, the first row or null, and the changed count', async () => {
		stubQuery(answer({ meta: { changes: 3 }, results: [{ id: 'a' }, { id: 'b' }] }));

		const statement = binding.prepare('SELECT id FROM comments');

		await expect(statement.all()).resolves.toEqual({ results: [{ id: 'a' }, { id: 'b' }] });
		await expect(statement.first()).resolves.toEqual({ id: 'a' });
		await expect(statement.run()).resolves.toEqual({ meta: { changes: 3 } });

		stubQuery(answer({ results: [] }));

		await expect(statement.first()).resolves.toBeNull();
	});

	test("throws D1's own message when it refuses the query", async () => {
		stubQuery({ errors: [{ code: 7500, message: 'no such table: comment' }], success: false }, 400);

		await expect(binding.prepare('SELECT * FROM comment').all()).rejects.toThrow(
			'D1 refused the query (400): no such table: comment',
		);
	});

	test("names Cloudflare's reason for an auth error, which answers a null result", async () => {
		stubQuery(
			{
				errors: [{ code: 10_000, message: 'Authentication error' }],
				messages: [],
				// eslint-disable-next-line unicorn/no-null -- Cloudflare's own error shape
				result: null,
				success: false,
			},
			403,
		);

		const failure = binding.prepare('SELECT 1').all();

		await expect(failure).rejects.toThrow('D1 refused the query (403): Authentication error');
		await expect(failure).rejects.not.toBeInstanceOf(D1UnavailableError);
	});

	test('reports a network failure or a 5xx as unavailable', async () => {
		vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('fetch failed'));

		await expect(binding.prepare('SELECT 1').all()).rejects.toBeInstanceOf(D1UnavailableError);

		stubQuery({ errors: [], success: false }, 503);

		await expect(binding.prepare('SELECT 1').all()).rejects.toBeInstanceOf(D1UnavailableError);
	});

	test('refuses to bind a SQL NULL before sending anything', async () => {
		const fetchSpy = stubQuery(answer({ results: [] }));

		// eslint-disable-next-line unicorn/no-null -- the case under test
		await expect(binding.prepare('SELECT ?').bind(null).all()).rejects.toThrow('SQL NULL');
		expect(fetchSpy).not.toHaveBeenCalled();
	});
});
