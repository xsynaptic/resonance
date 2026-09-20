import { siteTitle } from '@xsynaptic/shared/constants';

import { feedPath } from '#e2e/constants.ts';
import { expect, test } from '#e2e/test.ts';

const itemsChecked = 5;

const contentLengthMinimum = 100;

function readTag(item: string, tag: string): string {
	return new RegExp(String.raw`<${tag}>([\s\S]*?)</${tag}>`).exec(item)?.[1]?.trim() ?? '';
}

test('the feed is valid RSS', async ({ request }) => {
	const response = await request.get(feedPath);

	expect(response.status()).toBe(200);
	expect(response.headers()['content-type']).toMatch(/xml/);

	const body = await response.text();

	expect(body).toContain('<rss');
	expect(body).toContain('<channel>');
	expect(body).toContain(`<title>${siteTitle}</title>`);
});

test('the first feed items carry a title, a link and a body', async ({ request }) => {
	const response = await request.get(feedPath);
	const feed = await response.text();
	const items = feed.match(/<item>[\s\S]*?<\/item>/g) ?? [];

	expect(items.length).toBeGreaterThanOrEqual(itemsChecked);

	for (const item of items.slice(0, itemsChecked)) {
		expect(readTag(item, 'title')).toBeTruthy();
		expect(readTag(item, 'link')).toBeTruthy();
		expect(readTag(item, 'content:encoded').length).toBeGreaterThan(contentLengthMinimum);
	}
});

test('the sitemap index names the url sitemap', async ({ request }) => {
	const response = await request.get('/sitemap-index.xml');

	expect(response.status()).toBe(200);
	expect(response.headers()['content-type']).toMatch(/xml/);

	const body = await response.text();

	expect(body).toContain('<sitemapindex');
	expect(body).toMatch(/<loc>[^<]*sitemap-0\.xml<\/loc>/);
});

test('the url sitemap is non-empty', async ({ request }) => {
	const response = await request.get('/sitemap-0.xml');

	expect(response.status()).toBe(200);

	const body = await response.text();

	expect(body.match(/<url>/g)?.length ?? 0).toBeGreaterThan(0);
});
