import { describe, expect, test } from 'vitest';

import {
	isActiveNavigationPath,
	isCurrentNavigationPath,
} from '#components/navigation/navigation-utils.ts';

describe('isActiveNavigationPath', () => {
	test('matches a parent term index against a term below it', () => {
		expect(isActiveNavigationPath('/themes/', '/themes/charts/')).toBe(true);
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
});

describe('isCurrentNavigationPath', () => {
	test('matches a navigation URL against its own page', () => {
		expect(isCurrentNavigationPath('/mixes/', '/mixes/')).toBe(true);
	});

	test('does not match a parent term index against a term below it', () => {
		expect(isCurrentNavigationPath('/themes/', '/themes/charts/')).toBe(false);
	});
});
