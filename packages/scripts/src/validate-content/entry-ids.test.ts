import { describe, expect, test } from 'vitest';

import { collectDuplicateIdIssues } from '#validate-content/entry-ids.ts';
import { makeEntry } from '#validate-content/validate-test-utils.ts';

describe('collectDuplicateIdIssues', () => {
	test('accepts distinct IDs', () => {
		const entries = [makeEntry({ id: 'goa-trance' }), makeEntry({ id: 'psychedelic-techno' })];

		expect(collectDuplicateIdIssues(entries)).toEqual([]);
	});

	test('flags the same ID claimed by two collections', () => {
		const entries = [
			makeEntry({ filePath: 'collections/labels/twisted.mdx', id: 'twisted' }),
			makeEntry({ filePath: 'collections/styles/twisted.mdx', id: 'twisted' }),
		];

		expect(collectDuplicateIdIssues(entries)).toEqual([
			{
				id: 'twisted',
				locations: ['collections/labels/twisted.mdx', 'collections/styles/twisted.mdx'],
			},
		]);
	});
});
