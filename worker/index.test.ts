import { afterEach, describe, expect, test, vi } from 'vitest';

import { t } from '#lib/i18n/i18n-strings.ts';
import worker from '#worker/index.ts';

function createEnv(): Env {
	// No route exercised here reaches D1, so the binding is left off the stub
	return {
		ASSETS: { fetch: () => Promise.resolve(new Response('asset', { status: 200 })) },
		IP_SALT: 'test-salt',
		TURNSTILE_SECRET_KEY: 'secret',
	} as unknown as Env;
}

afterEach(() => {
	vi.restoreAllMocks();
});

describe('fetch', () => {
	test('answers a non-POST on an API route with 405, not the 404 page', async () => {
		for (const path of ['/api/comments', '/api/listen']) {
			for (const method of ['GET', 'HEAD', 'PUT']) {
				const response = await worker.fetch(
					new Request(`https://example.test${path}`, { method }),
					createEnv(),
				);

				expect(response.status).toBe(405);
				expect(response.headers.get('allow')).toBe('POST');
				await expect(response.text()).resolves.toBe('');
			}
		}
	});

	test('logs and answers 500 when the handler throws', async () => {
		const logged = vi.spyOn(console, 'error').mockImplementation(vi.fn());
		const env = createEnv();

		env.IP_SALT = '';

		const response = await worker.fetch(
			new Request('https://example.test/api/comments', {
				headers: { accept: 'application/json' },
				method: 'POST',
			}),
			env,
		);

		expect(response.status).toBe(500);
		await expect(response.json()).resolves.toEqual({ message: t('comments.error.unexpected') });
		expect(logged).toHaveBeenCalledOnce();
	});
});
