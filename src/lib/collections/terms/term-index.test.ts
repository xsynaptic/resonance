import { fc, test } from '@fast-check/vitest';
import { describe, expect, vi } from 'vitest';

import type { StubEntry } from '#lib/collections/astro-content-stub.ts';

type Fixtures = Record<string, Array<Pick<StubEntry, 'data' | 'id'>>>;

type IndexName = Extract<keyof Awaited<ReturnType<typeof importIndexes>>, `get${string}Index`>;

const fixtures: Fixtures = {
	artists: [
		{ data: { title: 'DJ Basilisk' }, id: 'dj-basilisk' },
		{ data: { title: 'Synaptic FX' }, id: 'synaptic-fx' },
		{ data: { title: 'Ott' }, id: 'ott' },
	],
	labels: [
		{ data: { title: 'Twisted Records' }, id: 'twisted-records' },
		{ data: { parent: { id: 'twisted-records' }, title: 'Twisted Sub' }, id: 'twisted-sub' },
	],
	mixes: [
		{
			data: {
				alias: { id: 'synaptic-fx' },
				artists: [{ id: 'dj-basilisk' }],
				dateCreated: new Date('2022-03-01'),
				regions: [{ id: 'taiwan' }],
				title: 'Esoteric Expanse',
			},
			id: 'esoteric',
		},
		{
			data: {
				alias: { id: 'dj-basilisk' },
				dateCreated: new Date('2024-05-01'),
				regions: [{ id: 'asia' }],
				title: 'Voyager',
			},
			id: 'voyager',
		},
	],
	posts: [
		{
			data: {
				artists: ['Some Guest', { id: 'ott' }],
				dateCreated: new Date('2025-01-01'),
				title: 'A Post',
			},
			id: 'a-post',
		},
	],
	regions: [
		{ data: { title: 'Asia' }, id: 'asia' },
		{ data: { parent: { id: 'asia' }, title: 'Taiwan' }, id: 'taiwan' },
		{ data: { title: 'Africa' }, id: 'africa' },
	],
	reviews: [
		{
			data: {
				artists: [{ id: 'ott' }],
				dateCreated: new Date('2023-01-01'),
				labels: [{ id: 'twisted-sub' }, 'Ancient Future'],
				title: 'Ott - Skylon',
			},
			id: 'ott-skylon',
		},
	],
	series: [
		{
			data: { seriesItems: ['voyager', 'no-such-mix', 'esoteric'], title: 'A Series' },
			id: 'a-series',
		},
	],
};

async function idsByTerm(
	name: IndexName,
	collections: Fixtures = fixtures,
): Promise<Record<string, Array<string>>> {
	const indexes = await importIndexes(collections);
	const index = await indexes[name]();

	return Object.fromEntries(
		[...index].map(([termId, items]) => [termId, items.map((item) => item.id)]),
	);
}

// Every index memoizes on first call, so each case builds from a fresh module graph
async function importIndexes(collections: Fixtures = fixtures) {
	vi.resetModules();

	const { setCollections } = await import('#lib/collections/astro-content-stub.ts');

	setCollections(collections);

	return import('#lib/collections/terms/term-index.ts');
}

describe('getArtistsIndex', () => {
	test('files a mix under the alias it was published as, not its artists', async () => {
		expect(await idsByTerm('getArtistsIndex')).toEqual({
			'dj-basilisk': ['voyager'],
			ott: ['a-post', 'ott-skylon'],
			'synaptic-fx': ['esoteric'],
		});
	});
});

describe('getLabelsIndex', () => {
	test('rolls a child label up to its parent and ignores free-text labels', async () => {
		expect(await idsByTerm('getLabelsIndex')).toEqual({
			'twisted-records': ['ott-skylon'],
			'twisted-sub': ['ott-skylon'],
		});
	});
});

describe('getRegionsIndex', () => {
	test('rolls descendants up without listing an item twice', async () => {
		expect(await idsByTerm('getRegionsIndex')).toEqual({
			asia: ['voyager', 'esoteric'],
			taiwan: ['esoteric'],
		});
	});
});

describe('getSeriesIndex', () => {
	test('keeps the order the series authored and drops what does not resolve', async () => {
		expect(await idsByTerm('getSeriesIndex')).toEqual({ 'a-series': ['voyager', 'esoteric'] });
	});
});

describe('every term index', () => {
	const references = fc.array(fc.constantFrom('ott', 'asia', 'taiwan'), { maxLength: 4 });

	test.prop([references, references, references], { numRuns: 30 })(
		'lists an entry once under each term it names, however often it names it',
		async (artists, regions, themes) => {
			const review = {
				data: {
					artists: artists.map((id) => ({ id })),
					dateCreated: new Date('2023-01-01'),
					regions: regions.map((id) => ({ id })),
					themes: themes.map((id) => ({ id })),
					title: 'A Review',
				},
				id: 'a-review',
			};
			const collections = { ...fixtures, mixes: [], posts: [], reviews: [review] };

			for (const [name, named] of [
				['getArtistsIndex', artists],
				['getThemesIndex', themes],
			] as const) {
				const index = await idsByTerm(name, collections);
				const expected = Object.fromEntries([...new Set(named)].map((id) => [id, ['a-review']]));

				expect(index).toEqual(expected);
			}

			const rolled = await idsByTerm('getRegionsIndex', collections);

			for (const ids of Object.values(rolled)) expect(ids).toEqual(['a-review']);
		},
	);
});
