import { describe, expect, test } from 'vitest';

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
					message:
						'collections/mixes/2019/prototypes-3.mdx: tracks[0].artists "Junion Jack" is one letter off artists "union-jack"',
				},
			],
			status: 'warn',
			summary: 'Found 1 free-text credit(s) one letter off a Term',
		});
	});
});
