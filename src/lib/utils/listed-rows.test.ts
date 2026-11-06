import { fc, test } from '@fast-check/vitest';
import { toCreditSlugs, toSlug } from '@xsynaptic/shared/routing';
import { describe, expect } from 'vitest';

import { toCreditId } from '#lib/utils/listed-rows.ts';

const names = ['The Nebula', 'Nebula', 'Union Jack', 'Drumlore', ''];
const ids = ['nebula', 'union-jack', 'drumlore', 'darkpsy'];

const terms = fc.uniqueArray(
	fc.record({ id: fc.constantFrom(...ids), title: fc.constantFrom(...names) }),
	{ maxLength: 4, minLength: 1, selector: (value) => value.id },
);

describe('toCreditId', () => {
	test.prop([terms, fc.constantFrom(...names, ...ids)])(
		'names a term exactly when the rendered credit links to it',
		(catalogTerms, credit) => {
			const slugs = toCreditSlugs(catalogTerms);
			const termIds = new Set(catalogTerms.map((value) => value.id));
			const id = toCreditId(credit, slugs);

			expect(termIds.has(id)).toBe(slugs.has(toSlug(credit)));
			if (termIds.has(id)) expect(id).toBe(slugs.get(toSlug(credit)));
		},
	);
});
