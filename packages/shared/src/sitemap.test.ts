import { describe, expect, test } from 'vitest';

import { isIndexableUrlPath } from '#sitemap.ts';

describe('isIndexableUrlPath', () => {
	test('indexes detail and list pages', () => {
		for (const pathname of ['/', '/mixes/', '/posts/', '/artists/dj-basilisk/', '/a-post/']) {
			expect(isIndexableUrlPath(pathname)).toBe(true);
		}
	});

	test('drops paginated routes, with or without a trailing slash', () => {
		for (const pathname of ['/posts/7/', '/posts/7', '/artists/dj-basilisk/2/', '/mixes/12/']) {
			expect(isIndexableUrlPath(pathname)).toBe(false);
		}
	});

	test('keeps a slug that merely ends in digits', () => {
		expect(isIndexableUrlPath('/blade-runner-2049/')).toBe(true);
	});
});
