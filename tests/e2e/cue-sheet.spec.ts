import { expect, test, visit } from '#e2e/test.ts';

test('a cue sheet is served and opens as one', async ({ request, site }) => {
	const response = await request.get(site.cueSheet);

	expect(response.status()).toBe(200);

	const body = await response.text();

	expect(body).toContain('FILE "');
	expect(body).toContain('TRACK 01 AUDIO');
	expect(body).toContain('INDEX 01 00:00:00');
});

test('the Mix page offers the cue sheet as a download', async ({ page, site }) => {
	await visit(page, site.mixDetail);

	await expect(page.locator(`a[href="${site.cueSheet}"]`)).toHaveAttribute('download', '');
});
