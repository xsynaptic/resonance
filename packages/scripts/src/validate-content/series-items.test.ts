import { describe, expect, test } from 'vitest';

import { validateSeriesItems } from '#validate-content/series-items.ts';
import { makeEntry } from '#validate-content/validate-test-utils.ts';

const members = [makeEntry({ id: 'all-stars-2011' }), makeEntry({ id: 'a-review' })];

describe('validateSeriesItems', () => {
	test('fails on an item that resolves to nothing, naming it', () => {
		const series = [
			makeEntry({
				data: { seriesItems: ['all-stars-2011', 'gone'] },
				filePath: 'collections/series/korner.mdx',
				id: 'korner',
			}),
		];

		expect(validateSeriesItems(series, members)).toEqual({
			issues: [{ message: 'collections/series/korner.mdx: unknown series item "gone"' }],
			status: 'fail',
			summary: 'Found 1 unknown series item(s)',
		});
	});
});
