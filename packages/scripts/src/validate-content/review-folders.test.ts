import { describe, expect, test } from 'vitest';

import { validateReviewFolders } from './review-folders.js';
import { makeEntry } from './validate-test-utils.js';

describe('validateReviewFolders', () => {
	test('passes a review filed under its release year', () => {
		const entries = [
			makeEntry({
				data: { releaseYear: '1995' },
				filePath: 'packages/content/collections/reviews/1995/koxbox-forever-after.mdx',
				id: 'koxbox-forever-after',
			}),
			makeEntry({
				data: {},
				filePath: 'packages/content/collections/reviews/_a-draft.mdx',
				id: 'a-draft',
			}),
		];

		expect(validateReviewFolders(entries).status).toBe('pass');
	});

	test('fails a review whose folder and release year disagree', () => {
		const entries = [
			makeEntry({
				data: { releaseYear: '1996' },
				filePath: 'packages/content/collections/reviews/1995/a-review.mdx',
				id: 'a-review',
			}),
			makeEntry({
				data: { releaseYear: '1999' },
				filePath: 'packages/content/collections/reviews/another-review.mdx',
				id: 'another-review',
			}),
		];

		expect(validateReviewFolders(entries).issues).toEqual([
			{
				message:
					'packages/content/collections/reviews/1995/a-review.mdx: filed under 1995, releaseYear says 1996',
			},
			{
				message:
					'packages/content/collections/reviews/another-review.mdx: filed under the collection root, releaseYear says 1999',
			},
		]);
	});
});
