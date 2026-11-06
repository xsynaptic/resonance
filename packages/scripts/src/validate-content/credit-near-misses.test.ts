import { fc, test } from '@fast-check/vitest';
import { toCreditSlugs, toSlug } from '@xsynaptic/shared/routing';
import { describe, expect } from 'vitest';

import { validateCreditNearMisses } from '#validate-content/credit-near-misses.ts';
import { makeEntry } from '#validate-content/validate-test-utils.ts';

const catalog = [
	makeEntry({ collection: 'artists', data: { title: 'Union Jack' }, id: 'union-jack' }),
	makeEntry({ collection: 'labels', data: { title: 'Drumlore' }, id: 'drumlore' }),
];

describe('validateCreditNearMisses', () => {
	test('warns on a free-text credit one letter off a Term, and not on one two letters off', () => {
		const entries = [
			makeEntry({
				data: {
					tracks: [{ artists: 'Junion Jack', labels: ['Drumcode'], title: 'Two Full Moons' }],
				},
				filePath: 'collections/mixes/2019/prototypes-3.mdx',
				id: 'prototypes-3',
			}),
		];

		expect(validateCreditNearMisses(entries, catalog)).toEqual({
			issues: [
				{
					location: 'collections/mixes/2019/prototypes-3.mdx',
					message: 'tracks[0].artists "Junion Jack" is one letter off artists "union-jack"',
				},
			],
			status: 'warn',
			summary: 'Found 1 free-text credit(s) one letter off a Term',
		});
	});

	const names = ['The Nebula', 'Nebula', 'Nebulo', 'Union Jack', 'Union Jacks', 'Drumlore'];
	const ids = ['nebula', 'union-jack', 'drumlore', 'darkpsy'];

	const term = fc.record({
		id: fc.oneof(fc.constantFrom(...ids), fc.constant(undefined)),
		title: fc.constantFrom(...names),
	});
	const terms = fc
		.uniqueArray(term, { maxLength: 4, minLength: 1, selector: (value) => value.id ?? value.title })
		.map((values) => values.map(({ id, title }) => ({ id: id ?? toSlug(title), title })));
	const credit = fc.constantFrom(...names, ...ids);

	test.prop([terms, credit])(
		'warns only on a credit the site leaves unlinked, and names a slug the site links on',
		(catalogTerms, name) => {
			const linked = toCreditSlugs(catalogTerms);
			const result = validateCreditNearMisses(
				[makeEntry({ data: { tracks: [{ artists: name, title: 'Track' }] }, id: 'mix' })],
				catalogTerms.map(({ id, title }) =>
					makeEntry({ collection: 'artists', data: { title }, id }),
				),
			);
			const [issue] = result.issues;

			if (linked.has(toSlug(name))) {
				expect(result.issues).toStrictEqual([]);
				return;
			}
			if (issue === undefined) return;

			const suggested = /artists "([^"]+)"$/.exec(issue.message)?.[1];

			expect(suggested !== undefined && linked.has(suggested)).toBe(true);
		},
	);
});
