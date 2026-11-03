import { expect, test } from '@playwright/test';

import { isDev, prodUrl } from '#e2e/constants.ts';

test.skip(isDev, 'the sitemap is a build artefact');

test.describe('sitemap', { tag: '@smoke' }, () => {
	test('the index names the url sitemap', async ({ request }) => {
		const response = await request.get('/sitemap-index.xml');

		expect(response.status()).toBe(200);
		expect(response.headers()['content-type']).toMatch(/xml/);

		const body = await response.text();

		expect(body).toContain('<sitemapindex');
		expect(body).toMatch(/<loc>[^<]*sitemap-0\.xml<\/loc>/);
	});

	test('the url sitemap lists the site on its production host', async ({ request }) => {
		const response = await request.get('/sitemap-0.xml');

		expect(response.status()).toBe(200);

		const body = await response.text();

		expect(body.match(/<url>/g)?.length ?? 0).toBeGreaterThan(0);

		const offHost = [...body.matchAll(/<loc>([^<]*)<\/loc>/g)]
			.map(([, location = '']) => location)
			.filter((location) => !location.startsWith(prodUrl));

		expect(offHost.slice(0, 5), 'sitemap URLs off the production host').toEqual([]);
	});
});
