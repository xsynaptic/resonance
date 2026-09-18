import { describe, expect, test, vi } from 'vitest';

import type { StubEntry } from '#lib/collections/astro-content-stub.ts';

type Fixtures = Record<string, Array<Pick<StubEntry, 'body' | 'data' | 'id'>>>;

const styles = [
	{ data: { title: 'Psytrance' }, id: 'psytrance' },
	{ data: { parent: { id: 'psytrance' }, title: 'Goa Trance' }, id: 'goa-trance' },
	{ data: { title: 'Ambient' }, id: 'ambient' },
];

// Pads the pool so a Style shared by a handful of entries is still rare enough to clear the threshold
const fillerPosts = ['filler-one', 'filler-two', 'filler-three', 'filler-four'].map((id) =>
	entry(id, { styles: [{ id: 'ambient' }] }),
);

function entry(id: string, data: Record<string, unknown> = {}) {
	return { data: { dateCreated: new Date('2020-01-01'), title: id, ...data }, id };
}

// The scorer memoizes its profiles, so each case builds from a fresh module graph
async function relatedIds(collections: Fixtures, id: string): Promise<Array<string>> {
	vi.resetModules();

	const { setCollections } = await import('#lib/collections/astro-content-stub.ts');

	setCollections({ styles, ...collections });

	const { getRelatedItems } = await import('#lib/catalog/catalog-related.ts');
	const items = await getRelatedItems(id);

	return items.map((item) => item.id);
}

describe('getRelatedItems', () => {
	test('ranks a shared rare Credit above a shared common Style of equal weight', async () => {
		const reviews = [
			entry('host', { artists: ['Rare Act'], styles: [{ id: 'goa-trance' }] }),
			entry('rare', { artists: ['Rare Act'], dateCreated: new Date('2010-01-01') }),
			entry('common-one', { dateCreated: new Date('2024-01-01'), styles: [{ id: 'goa-trance' }] }),
			entry('common-two', { dateCreated: new Date('2023-01-01'), styles: [{ id: 'goa-trance' }] }),
			entry('common-three', {
				dateCreated: new Date('2022-01-01'),
				styles: [{ id: 'goa-trance' }],
			}),
		];

		expect(await relatedIds({ reviews }, 'host')).toEqual([
			'rare',
			'common-one',
			'common-two',
			'common-three',
		]);
	});

	test('credits a Style matched only through its parent, below a direct match', async () => {
		const reviews = [
			entry('host', { eras: [{ id: 'mid-1990s' }], styles: [{ id: 'goa-trance' }] }),
			entry('direct', {
				dateCreated: new Date('2019-01-01'),
				eras: [{ id: 'mid-1990s' }],
				styles: [{ id: 'goa-trance' }],
			}),
			// The shared Era alone falls under the threshold, so appearing at all takes the parent credit
			entry('parent', {
				dateCreated: new Date('2024-01-01'),
				eras: [{ id: 'mid-1990s' }],
				styles: [{ id: 'psytrance' }],
			}),
			entry('unrelated', { dateCreated: new Date('2025-01-01'), styles: [{ id: 'ambient' }] }),
		];

		expect(await relatedIds({ reviews }, 'host')).toEqual(['direct', 'parent']);
	});

	test('ranks a strong match from another Collection above a weak one from its own', async () => {
		const collections = {
			mixes: [
				entry('strong', {
					dateCreated: new Date('2015-01-01'),
					styles: [{ id: 'goa-trance' }],
					tracks: [
						{ artists: 'Astral Projection', title: 'Kabalah' },
						{ artists: 'Mantra', title: 'Arrival' },
					],
				}),
			],
			posts: fillerPosts,
			reviews: [
				entry('host', {
					artists: ['Astral Projection', 'Mantra'],
					styles: [{ id: 'goa-trance' }],
				}),
				entry('weak', { dateCreated: new Date('2025-01-01'), styles: [{ id: 'goa-trance' }] }),
			],
		};

		expect(await relatedIds(collections, 'host')).toEqual(['strong', 'weak']);
	});

	test('favours its own Collection when matches are otherwise equal', async () => {
		const collections = {
			mixes: [
				entry('twin-mix', { dateCreated: new Date('2025-01-01'), styles: [{ id: 'goa-trance' }] }),
			],
			posts: fillerPosts,
			reviews: [
				entry('host', { styles: [{ id: 'goa-trance' }] }),
				entry('twin-review', {
					dateCreated: new Date('2015-01-01'),
					styles: [{ id: 'goa-trance' }],
				}),
			],
		};

		expect(await relatedIds(collections, 'host')).toEqual(['twin-review', 'twin-mix']);
	});

	test('relates both ends of a Selection and an inline Link', async () => {
		const collections = {
			mixes: [entry('selected-mix')],
			posts: [
				{
					...entry('the-post', { selections: [{ entryId: 'selected-mix' }] }),
					body: 'Compare <Link id="linked-review">the review</Link>.',
				},
			],
			reviews: [entry('linked-review')],
		};

		const postRelated = await relatedIds(collections, 'the-post');

		expect(postRelated.toSorted((first, second) => first.localeCompare(second))).toEqual([
			'linked-review',
			'selected-mix',
		]);
		expect(await relatedIds(collections, 'linked-review')).toEqual(['the-post']);
		expect(await relatedIds(collections, 'selected-mix')).toEqual(['the-post']);
	});

	test('matches a free-text Credit to the cataloged Term its name resolves to', async () => {
		const collections = {
			artists: [{ data: { title: 'Astral Projection' }, id: 'ap' }],
			mixes: [
				entry('tracklist', { tracks: [{ artists: 'Astral Projection', title: 'Mahadeva' }] }),
			],
			posts: fillerPosts,
			reviews: [entry('host', { artists: [{ id: 'ap' }] })],
		};

		expect(await relatedIds(collections, 'host')).toEqual(['tracklist']);
	});

	test('breaks a tie on the nearest release year before the newest date', async () => {
		const collections = {
			posts: fillerPosts,
			reviews: [
				entry('host', { releaseYear: '1995', styles: [{ id: 'goa-trance' }] }),
				entry('near', {
					dateCreated: new Date('2010-01-01'),
					releaseYear: '1996',
					styles: [{ id: 'goa-trance' }],
				}),
				entry('far', {
					dateCreated: new Date('2020-01-01'),
					releaseYear: '2010',
					styles: [{ id: 'goa-trance' }],
				}),
				entry('unknown', { dateCreated: new Date('2025-01-01'), styles: [{ id: 'goa-trance' }] }),
			],
		};

		expect(await relatedIds(collections, 'host')).toEqual(['near', 'far', 'unknown']);
	});

	test('drops a candidate under the threshold and leaves an unmatched entry empty', async () => {
		const collections = {
			posts: [entry('lonely')],
			reviews: [
				entry('host', { eras: [{ id: 'mid-1990s' }], styles: [{ id: 'goa-trance' }] }),
				entry('era-only', { eras: [{ id: 'mid-1990s' }] }),
				entry('style-match', { styles: [{ id: 'goa-trance' }] }),
			],
		};

		expect(await relatedIds(collections, 'host')).toEqual(['style-match']);
		expect(await relatedIds(collections, 'lonely')).toEqual([]);
	});
});
