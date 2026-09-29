import { describe, expect, test } from 'vitest';

import { validateSelectionEntryIds } from '#validate-content/selection-entry-ids.ts';
import { makeEntry } from '#validate-content/validate-test-utils.ts';

const linkableIds = new Set(['a-review', 'prototypes-3']);

describe('validateSelectionEntryIds', () => {
	test('fails on an entryId that resolves to nothing, naming the row', () => {
		const posts = [
			makeEntry({
				collection: 'posts',
				data: {
					selections: [{ entryId: 'a-review' }, { title: 'Inline only' }, { entryId: 'gone' }],
				},
				filePath: 'collections/posts/2011/best-of-2011.mdx',
				id: 'best-of-2011',
			}),
		];

		expect(validateSelectionEntryIds(posts, linkableIds)).toEqual({
			issues: [
				{
					message:
						'collections/posts/2011/best-of-2011.mdx: selections[2].entryId "gone" names no entry',
				},
			],
			status: 'fail',
			summary: 'Found 1 unknown selection entryId(s)',
		});
	});
});
