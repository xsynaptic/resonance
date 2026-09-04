import { describe, expect, test } from 'vitest';

import { createCatalog } from '#lib/catalog/catalog-factory.ts';
import { makeContentItem, makeTermItem } from '#lib/catalog/catalog-test-utils.ts';

const catalog = createCatalog([
	makeContentItem({ collection: 'mixes', id: 'silicon-overmind-3' }),
	makeContentItem({ collection: 'reviews', id: 'third-eye-ancient-future' }),
	makeContentItem({ collection: 'mixes', id: 'esoteric-expanse-4' }),
	makeContentItem({ collection: 'pages', id: 'profile' }),
	makeTermItem({ collection: 'artists', id: 'dj-basilisk' }),
	makeTermItem({ collection: 'labels', id: 'techgnosis-records' }),
]);

const ids = (items: ReadonlyArray<{ id: string }>) => items.map((item) => item.id);

describe('getById', () => {
	test('resolves an id in any collection', () => {
		expect(catalog.getById('esoteric-expanse-4')?.url).toBe('/mixes/esoteric-expanse-4/');
		expect(catalog.getById('profile')?.url).toBe('/pages/profile/');
		expect(catalog.getById('dj-basilisk')?.url).toBe('/artists/dj-basilisk/');
	});

	test('returns undefined for an unknown id', () => {
		expect(catalog.getById('no-such-entry')).toBeUndefined();
	});
});

describe('byCollection', () => {
	test('returns items from the named collections in source order', () => {
		expect(ids(catalog.byCollection('mixes'))).toEqual([
			'silicon-overmind-3',
			'esoteric-expanse-4',
		]);
		expect(ids(catalog.byCollection('mixes', 'reviews'))).toEqual([
			'silicon-overmind-3',
			'third-eye-ancient-future',
			'esoteric-expanse-4',
		]);
	});

	test('returns nothing for a collection holding no items', () => {
		expect(catalog.byCollection('themes')).toEqual([]);
	});

	test('narrows a content collection to items carrying a date', () => {
		const [mix] = catalog.byCollection('mixes');

		expect(mix?.date).toBeInstanceOf(Date);
	});
});
