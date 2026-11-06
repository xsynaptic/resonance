import { fc, test } from '@fast-check/vitest';
import { describe, expect } from 'vitest';

import { validateIndexedPaths } from '#validate-content/indexed-paths.ts';
import { makeEntry } from '#validate-content/validate-test-utils.ts';

const slugCharacters = fc.constantFrom('1', '9', '0', '8', 'a', 'z', '-');
const entryId = fc
	.array(slugCharacters, { maxLength: 6, minLength: 1 })
	.map((characters) => characters.join(''))
	.filter((id) => /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id));
const collection = fc.constantFrom('artists', 'labels', 'mixes', 'pages', 'posts', 'reviews');

describe('validateIndexedPaths', () => {
	test.prop([collection, entryId])(
		'fails an entry exactly when its id is all digits',
		(entryCollection, id) => {
			const result = validateIndexedPaths([makeEntry({ collection: entryCollection, id })]);

			expect(result.status === 'fail').toBe(/^\d+$/.test(id));
		},
	);
});
