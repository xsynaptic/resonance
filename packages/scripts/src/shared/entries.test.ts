import { describe, expect, test } from 'vitest';

import { toFormerIds, toReferenceIds } from './entries.js';

describe('toFormerIds', () => {
	test('returns the former slugs an entry answers to', () => {
		expect(toFormerIds({ data: { formerIds: ['old-slug', 'older-slug'] } })).toEqual([
			'old-slug',
			'older-slug',
		]);
	});

	test('returns an empty array when the field is absent or not an array', () => {
		expect(toFormerIds({ data: {} })).toEqual([]);
		expect(toFormerIds({ data: { formerIds: 'old-slug' } })).toEqual([]);
	});

	test('drops non-string entries', () => {
		expect(toFormerIds({ data: { formerIds: ['old-slug', 42, undefined] } })).toEqual(['old-slug']);
	});
});

describe('toReferenceIds', () => {
	test('extracts ids from reference objects', () => {
		const references = [
			{ collection: 'artists', id: 'shpongle' },
			{ collection: 'artists', id: 'simon-posford' },
		];

		expect(toReferenceIds(references)).toEqual(['shpongle', 'simon-posford']);
	});

	test('reads a scalar ref, which is how a track writes a single artist', () => {
		expect(toReferenceIds({ collection: 'artists', id: 'shpongle' })).toEqual(['shpongle']);
	});

	test('drops free text, which carries no id', () => {
		expect(toReferenceIds(['Some Unknown Act', { id: 'shpongle' }])).toEqual(['shpongle']);
		expect(toReferenceIds('Some Unknown Act')).toEqual([]);
		expect(toReferenceIds(undefined)).toEqual([]);
	});
});
