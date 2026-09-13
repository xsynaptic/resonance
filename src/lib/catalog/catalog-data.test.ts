import { describe, expect, test, vi } from 'vitest';

import type { Catalog } from '#lib/catalog/catalog-factory.ts';
import type { StubEntry } from '#lib/collections/astro-content-stub.ts';

type Fixtures = Record<string, Array<Pick<StubEntry, 'data' | 'id'>>>;

const fixtures: Fixtures = {
	artists: [{ data: { title: 'DJ Basilisk' }, id: 'dj-basilisk' }],
	labels: [{ data: { title: 'Twisted Records' }, id: 'twisted-records' }],
	mixes: [
		{
			data: {
				alias: { collection: 'artists', id: 'dj-basilisk' },
				dateCreated: new Date('2024-05-01'),
				imageFeatured: 'voyager-cover',
				labels: [{ id: 'twisted-records' }],
				title: 'Voyager',
			},
			id: 'voyager',
		},
		{ data: { dateCreated: new Date('2022-03-01'), title: 'Esoteric Expanse' }, id: 'esoteric' },
	],
	pages: [{ data: { dateCreated: new Date('2019-01-01'), title: 'Profile' }, id: 'profile' }],
	posts: [{ data: { dateCreated: new Date('2025-01-01'), title: 'A Post' }, id: 'a-post' }],
	reviews: [
		{
			data: {
				dateCreated: new Date('2023-01-01'),
				labels: [{ id: 'twisted-records' }, 'Ancient Future'],
				releaseTitle: 'Skylon',
				releaseYear: '2008',
				title: 'Ott - Skylon',
			},
			id: 'ott-skylon',
		},
	],
};

// The catalog memoizes on first call, so each case builds it from a fresh module graph
async function buildCatalog(collections: Fixtures = fixtures): Promise<Catalog> {
	vi.resetModules();

	const { setCollections } = await import('#lib/collections/astro-content-stub.ts');

	setCollections(collections);

	const { getCatalog } = await import('#lib/catalog/catalog-data.ts');

	return getCatalog();
}

function contentItem(catalog: Catalog, id: string) {
	return catalog.byCollection('mixes', 'posts', 'reviews').find((item) => item.id === id);
}

describe('getCatalog', () => {
	test('orders content newest first across collections, with terms after it', async () => {
		const catalog = await buildCatalog();

		expect(catalog.all().map((item) => item.id)).toEqual([
			'a-post',
			'voyager',
			'ott-skylon',
			'esoteric',
			'profile',
			'dj-basilisk',
			'twisted-records',
		]);
	});

	test('carries the entry as a linkable item', async () => {
		const catalog = await buildCatalog();

		expect(catalog.getById('voyager')).toEqual({
			collection: 'mixes',
			date: new Date('2024-05-01'),
			id: 'voyager',
			image: 'voyager-cover',
			subtitle: 'Twisted Records, 2024',
			title: 'Voyager',
			url: '/mixes/voyager/',
			work: {
				credit: { name: 'DJ Basilisk', url: '/artists/dj-basilisk/' },
				title: 'Voyager',
			},
		});
	});

	test('puts posts and pages at the site root', async () => {
		const catalog = await buildCatalog();

		expect(catalog.getById('a-post')?.url).toBe('/a-post/');
		expect(catalog.getById('profile')?.url).toBe('/profile/');
	});

	test('subtitles a review with its release year, not the year it was written', async () => {
		const catalog = await buildCatalog();

		expect(contentItem(catalog, 'ott-skylon')?.subtitle).toBe(
			'Twisted Records / Ancient Future, 2008',
		);
	});

	test('falls back to the entry year on a mix', async () => {
		const catalog = await buildCatalog();

		expect(contentItem(catalog, 'esoteric')?.subtitle).toBe('2022');
	});

	test('subtitles nothing on a collection that is not a Work', async () => {
		const catalog = await buildCatalog();

		expect(contentItem(catalog, 'a-post')?.subtitle).toBeUndefined();
	});

	test('refuses two collections claiming the same id', async () => {
		await expect(
			buildCatalog({
				artists: [{ data: { title: 'Voyager' }, id: 'voyager' }],
				mixes: fixtures.mixes ?? [],
			}),
		).rejects.toThrow('id "voyager" exists in both');
	});
});
