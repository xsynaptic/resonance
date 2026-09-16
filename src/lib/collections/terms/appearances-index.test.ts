import { describe, expect, test, vi } from 'vitest';

import type { StubEntry } from '#lib/collections/astro-content-stub.ts';

type Fixtures = Record<string, Array<Pick<StubEntry, 'data' | 'id'>>>;

type IndexName = 'getArtistAppearancesIndex' | 'getLabelAppearancesIndex';

const artists = [{ data: { title: 'Koxbox' }, id: 'koxbox' }];

const labels = [
	{ data: { title: 'Twisted Records' }, id: 'twisted-records' },
	{ data: { parent: { id: 'twisted-records' }, title: 'Twisted Sub' }, id: 'twisted-sub' },
];

function entry(id: string, data: Record<string, unknown> = {}) {
	return { data: { dateCreated: new Date('2020-01-01'), title: id, ...data }, id };
}

// Every index memoizes on first call, so each case builds from a fresh module graph
async function idsByTerm(
	name: IndexName,
	collections: Fixtures,
): Promise<Record<string, Array<string>>> {
	vi.resetModules();

	const { setCollections } = await import('#lib/collections/astro-content-stub.ts');

	setCollections(collections);

	const indexes = await import('#lib/collections/terms/appearances-index.ts');
	const index = await indexes[name]();

	return Object.fromEntries(
		[...index].map(([termId, items]) => [termId, items.map((item) => item.id)]),
	);
}

describe('getArtistAppearancesIndex', () => {
	test('resolves a free-text track credit and ignores an uncataloged name', async () => {
		const mixes = [
			entry('voyager', {
				tracks: [
					{ artists: 'Koxbox', title: 'Dragon Tales' },
					{ artists: 'Nobody Cataloged', title: 'Elsewhere' },
				],
			}),
		];

		expect(await idsByTerm('getArtistAppearancesIndex', { artists, mixes })).toEqual({
			koxbox: ['voyager'],
		});
	});

	test('never lists an Entry among its own Term appearances', async () => {
		const reviews = [
			entry('koxbox-forever-after', {
				artists: [{ id: 'koxbox' }],
				tracks: [{ artists: 'Koxbox', title: 'Stratosfear' }],
			}),
		];

		expect(await idsByTerm('getArtistAppearancesIndex', { artists, reviews })).toEqual({});
	});

	test('reads a grouped Tracklist and lists an Entry once however often it credits the Term', async () => {
		const mixes = [
			entry('in-exile', {
				tracks: [
					{
						title: 'Side A',
						tracks: [
							{ artists: 'Koxbox', title: 'One' },
							{ artists: 'Koxbox', title: 'Two' },
						],
					},
				],
			}),
		];

		expect(await idsByTerm('getArtistAppearancesIndex', { artists, mixes })).toEqual({
			koxbox: ['in-exile'],
		});
	});

	test('folds mixArtists into the artists index', async () => {
		const mixes = [entry('moonshadow', { tracks: [{ mixArtists: 'Koxbox', title: 'A Remix' }] })];

		expect(await idsByTerm('getArtistAppearancesIndex', { artists, mixes })).toEqual({
			koxbox: ['moonshadow'],
		});
	});

	test('reads a Selection row the way it reads a Track', async () => {
		const posts = [
			entry('best-albums-1995', { selections: [{ artists: 'Koxbox', title: 'Forever After' }] }),
		];

		expect(await idsByTerm('getArtistAppearancesIndex', { artists, posts })).toEqual({
			koxbox: ['best-albums-1995'],
		});
	});
});

describe('getLabelAppearancesIndex', () => {
	test('rolls a track credit on a sublabel up to its parent', async () => {
		const mixes = [
			entry('rolled', { tracks: [{ labels: [{ id: 'twisted-sub' }], title: 'One' }] }),
		];

		expect(await idsByTerm('getLabelAppearancesIndex', { labels, mixes })).toEqual({
			'twisted-records': ['rolled'],
			'twisted-sub': ['rolled'],
		});
	});

	test('subtracts after rolling up, so a parent sheds an Entry its own frontmatter credits', async () => {
		const reviews = [
			entry('parent-authored', {
				labels: [{ id: 'twisted-records' }],
				tracks: [{ labels: [{ id: 'twisted-sub' }], title: 'One' }],
			}),
		];

		expect(await idsByTerm('getLabelAppearancesIndex', { labels, reviews })).toEqual({
			'twisted-sub': ['parent-authored'],
		});
	});
});
