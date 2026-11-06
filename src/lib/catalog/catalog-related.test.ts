import { fc, test } from '@fast-check/vitest';
import { describe, expect, vi } from 'vitest';

import type { RelatedContext, RelatedProfile } from '#lib/catalog/catalog-related.ts';
import type { StubEntry } from '#lib/collections/astro-content-stub.ts';

import { scoreCandidate } from '#lib/catalog/catalog-related.ts';

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

const ancestorsNearestFirstFromHierarchy = new Map<string, ReadonlyArray<string>>([
	['labels:parent', []],
	['labels:sublabel', ['labels:parent']],
	['styles:child', ['styles:root']],
	['styles:grandchild', ['styles:child', 'styles:root']],
	['styles:root', []],
]);

const signalWeightsByTerm = new Map<string, ReadonlyArray<number>>([
	['labels:parent', [1.5, 0.5]],
	['labels:sublabel', [1.5, 0.5]],
	['styles:child', [3]],
	['styles:grandchild', [3]],
	['styles:root', [3]],
]);

const termKeys = [...signalWeightsByTerm.keys()];

function signalWeightsOf(key: string): ReadonlyArray<number> {
	return signalWeightsByTerm.get(key) ?? [];
}

const termsWeightedByCollectTerms = fc
	.subarray(termKeys)
	.chain((keys) =>
		fc.tuple(
			...keys.map((key) =>
				fc.constantFrom(...signalWeightsOf(key)).map((weight) => [key, weight] as const),
			),
		),
	)
	.map((terms) => new Map(terms));

const positiveRarityFromMeasureRarity = fc
	.tuple(...termKeys.map(() => fc.constantFrom(0.5, 1, 2, 4)))
	.map((rarities) => new Map(termKeys.map((key, index) => [key, rarities[index] ?? 0] as const)));

const relatedCollection = fc.constantFrom('mixes' as const, 'reviews' as const);

const scoredPair = fc.record({
	candidate: termsWeightedByCollectTerms,
	candidateCollection: relatedCollection,
	entry: termsWeightedByCollectTerms.filter((terms) => terms.size > 0),
	entryCollection: relatedCollection,
	rarity: positiveRarityFromMeasureRarity,
});

const pairGainingATermTheEntryCarries = scoredPair.chain((pair) =>
	fc
		.constantFrom(...pair.entry.keys())
		.chain((key) =>
			fc
				.constantFrom(...signalWeightsOf(key))
				.map((weight) => ({ ...pair, gained: { key, weight } })),
		),
);

function toProfile(
	id: string,
	collection: RelatedProfile['collection'],
	terms: Map<string, number>,
): RelatedProfile {
	return {
		collection,
		dateCreated: new Date(0),
		id,
		references: new Set(),
		terms,
		year: undefined,
	};
}

function toContext(rarity: Map<string, number>): RelatedContext {
	return {
		ancestors: ancestorsNearestFirstFromHierarchy,
		items: new Map(),
		profiles: new Map(),
		rarity,
	};
}

describe('scoreCandidate', () => {
	test.prop([pairGainingATermTheEntryCarries], { numRuns: 1000 })(
		'never lowers a score when the candidate gains a term the entry carries, with rarity held fixed',
		({ candidate, candidateCollection, entry, entryCollection, gained, rarity }) => {
			const context = toContext(rarity);
			const host = toProfile('entry', entryCollection, entry);
			const gainedTerms = new Map(candidate).set(
				gained.key,
				Math.max(gained.weight, candidate.get(gained.key) ?? 0),
			);

			const before = scoreCandidate(
				host,
				toProfile('candidate', candidateCollection, candidate),
				context,
			);
			const after = scoreCandidate(
				host,
				toProfile('candidate', candidateCollection, gainedTerms),
				context,
			);

			expect(after).toBeGreaterThanOrEqual(before);
		},
	);

	test.prop([scoredPair], { numRuns: 1000 })(
		'scores a pair the same whichever side is the entry',
		({ candidate, candidateCollection, entry, entryCollection, rarity }) => {
			const context = toContext(rarity);
			const first = toProfile('first', entryCollection, entry);
			const second = toProfile('second', candidateCollection, candidate);

			expect(scoreCandidate(first, second, context)).toBeCloseTo(
				scoreCandidate(second, first, context),
				9,
			);
		},
	);

	test.each([
		{
			candidate: [['styles:root', 3]],
			entry: [['styles:child', 3]],
			gained: ['styles:child', 3],
			path: 'an exact match replacing the route through its parent',
			rarity: [
				['styles:child', 0.5],
				['styles:root', 2],
			],
		},
		{
			candidate: [['styles:root', 3]],
			entry: [
				['styles:child', 3],
				['styles:grandchild', 3],
			],
			gained: ['styles:child', 3],
			path: 'a nearer ancestor shadowing a farther one',
			rarity: [
				['styles:child', 1],
				['styles:grandchild', 1],
				['styles:root', 2],
			],
		},
		{
			candidate: [['labels:sublabel', 1.5]],
			entry: [['labels:parent', 0.5]],
			gained: ['labels:parent', 0.5],
			path: 'a listed parent Label replacing the route from an authored sublabel',
			rarity: [
				['labels:parent', 0.5],
				['labels:sublabel', 4],
			],
		},
	] satisfies Array<{
		candidate: Array<[string, number]>;
		entry: Array<[string, number]>;
		gained: [string, number];
		path: string;
		rarity: Array<[string, number]>;
	}>)('keeps the score through $path', ({ candidate, entry, gained, rarity }) => {
		const context = toContext(new Map(rarity));
		const host = toProfile('entry', 'reviews', new Map(entry));
		const before = scoreCandidate(
			host,
			toProfile('candidate', 'reviews', new Map(candidate)),
			context,
		);
		const after = scoreCandidate(
			host,
			toProfile('candidate', 'reviews', new Map([...candidate, gained])),
			context,
		);

		expect(after).toBeGreaterThanOrEqual(before);
	});

	test('credits each term once, by its best route alone', () => {
		const context = toContext(
			new Map([
				['styles:child', 1],
				['styles:grandchild', 1],
				['styles:root', 2],
			]),
		);
		const entry = toProfile('entry', 'reviews', new Map([['styles:grandchild', 3]]));
		const candidate = toProfile(
			'candidate',
			'mixes',
			new Map([
				['styles:child', 3],
				['styles:grandchild', 3],
				['styles:root', 3],
			]),
		);

		expect(scoreCandidate(entry, candidate, context)).toBeCloseTo(3, 9);
	});
});
