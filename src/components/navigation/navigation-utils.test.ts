import { describe, expect, test } from 'vitest';

import {
	isActiveNavigationPath,
	isCurrentNavigationPath,
} from '#components/navigation/navigation-utils.ts';

describe('isActiveNavigationPath', () => {
	test('matches a navigation URL against its own page', () => {
		expect(isActiveNavigationPath('/mixes/', '/mixes/')).toBe(true);
	});

	test('matches a parent term index against a term below it', () => {
		expect(isActiveNavigationPath('/formats/', '/formats/selections/')).toBe(true);
	});

	test('matches a collection index against its paginated pages', () => {
		expect(isActiveNavigationPath('/blog/', '/blog/2/')).toBe(true);
	});

	test('does not match across a segment boundary', () => {
		expect(isActiveNavigationPath('/profile/', '/profiles/x/')).toBe(false);
	});

	test('normalizes a pathname arriving without its trailing slash', () => {
		expect(isActiveNavigationPath('/mixes/', '/mixes')).toBe(true);
	});

	test('never matches an external URL', () => {
		expect(isActiveNavigationPath('https://x.com/djbasilisk', '/mixes/')).toBe(false);
	});

	test('never matches an item with no URL', () => {
		expect(isActiveNavigationPath(undefined, '/mixes/')).toBe(false);
	});
});

describe('isCurrentNavigationPath', () => {
	test('matches a navigation URL against its own page', () => {
		expect(isCurrentNavigationPath('/mixes/', '/mixes/')).toBe(true);
	});

	test('does not match a parent term index against a term below it', () => {
		expect(isCurrentNavigationPath('/formats/', '/formats/selections/')).toBe(false);
	});

	test('does not match a collection index against its paginated pages', () => {
		expect(isCurrentNavigationPath('/blog/', '/blog/2/')).toBe(false);
	});

	test('normalizes a pathname arriving without its trailing slash', () => {
		expect(isCurrentNavigationPath('/mixes/', '/mixes')).toBe(true);
	});

	test('never matches an external URL', () => {
		expect(isCurrentNavigationPath('https://x.com/djbasilisk', '/mixes/')).toBe(false);
	});

	test('never matches an item with no URL', () => {
		expect(isCurrentNavigationPath(undefined, '/mixes/')).toBe(false);
	});
});
