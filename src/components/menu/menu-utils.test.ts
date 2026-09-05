import { describe, expect, test } from 'vitest';

import { isActiveMenuPath } from '#components/menu/menu-utils.ts';

describe('isActiveMenuPath', () => {
	test('matches a menu URL against its own page', () => {
		expect(isActiveMenuPath('/mixes/', '/mixes/')).toBe(true);
	});

	test('matches a parent term index against a term below it', () => {
		expect(isActiveMenuPath('/formats/', '/formats/selections/')).toBe(true);
	});

	test('matches a collection index against its paginated pages', () => {
		expect(isActiveMenuPath('/blog/', '/blog/2/')).toBe(true);
	});

	test('does not match across a segment boundary', () => {
		expect(isActiveMenuPath('/profile/', '/profiles/x/')).toBe(false);
	});

	test('normalizes a pathname arriving without its trailing slash', () => {
		expect(isActiveMenuPath('/mixes/', '/mixes')).toBe(true);
	});

	test('never matches an external URL', () => {
		expect(isActiveMenuPath('https://x.com/djbasilisk', '/mixes/')).toBe(false);
	});

	test('never matches an item with no URL', () => {
		expect(isActiveMenuPath(undefined, '/mixes/')).toBe(false);
	});
});
