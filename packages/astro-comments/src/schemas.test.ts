import { describe, expect, test } from 'vitest';

import { threadKeyPattern } from '#schemas.ts';

describe('threadKeyPattern', () => {
	test('takes one segment or several joined by single slashes', () => {
		for (const thread of ['about', 'mixes/voyager', 'blog/2026/a_post', 'post-42']) {
			expect(threadKeyPattern.test(thread)).toBe(true);
		}
	});

	test('refuses anything a path built from it could escape through', () => {
		for (const thread of ['', '../x', 'a/../b', '/a', 'a/', 'a//b', 'a.b', 'a b', 'a?b', 'a%2Fb']) {
			expect(threadKeyPattern.test(thread)).toBe(false);
		}
	});
});
