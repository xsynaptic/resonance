import { describe, expect, test } from 'vitest';

import { toFormerIds, toReferenceIds } from '#shared/entries.ts';

describe('toFormerIds', () => {
	test('drops non-string entries', () => {
		expect(toFormerIds({ data: { formerIds: ['old-slug', 42, undefined] } })).toEqual(['old-slug']);
	});
});

describe('toReferenceIds', () => {
	test('reads a scalar credit, which is how a track writes a single artist', () => {
		expect(toReferenceIds({ collection: 'artists', id: 'shpongle' })).toEqual(['shpongle']);
	});

	test('drops free text, which carries no id', () => {
		expect(toReferenceIds(['Some Unknown Act', { id: 'shpongle' }])).toEqual(['shpongle']);
		expect(toReferenceIds('Some Unknown Act')).toEqual([]);
		expect(toReferenceIds(undefined)).toEqual([]);
	});
});
