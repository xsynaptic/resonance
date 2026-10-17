import { describe, expect, test } from 'vitest';

import { getUrlPathIndexing } from '#sitemap.ts';

describe('getUrlPathIndexing', () => {
	test('indexes and follows an ordinary content path', () => {
		expect(getUrlPathIndexing('/mixes/some-mix/')).toStrictEqual({ follow: true, index: true });
	});

	test('follows but does not index paginated routes, with or without a trailing slash', () => {
		for (const pathname of ['/posts/7/', '/posts/7', '/artists/dj-basilisk/2/', '/mixes/12/']) {
			expect(getUrlPathIndexing(pathname)).toStrictEqual({ follow: true, index: false });
		}
	});

	test('indexes a slug that merely ends in digits', () => {
		expect(getUrlPathIndexing('/blade-runner-2049/').index).toBe(true);
	});
});
