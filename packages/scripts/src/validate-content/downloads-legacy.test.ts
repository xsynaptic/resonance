import { describe, expect, test } from 'vitest';

import { validateDownloadsLegacy } from './downloads-legacy.js';
import { makeEntry } from './validate-test-utils.js';

describe('validateDownloadsLegacy', () => {
	test('passes when every format has a file', () => {
		const mixes = [
			makeEntry({
				data: {
					downloadsLegacy: { flac: 7963, mp3: 24_359 },
					files: ['A Mix.mp3', 'A Mix.flac'],
				},
				id: 'a-mix',
			}),
		];

		expect(validateDownloadsLegacy(mixes).status).toBe('pass');
	});

	test('passes when a file has no count, which is not an error', () => {
		const mixes = [
			makeEntry({
				data: { downloadsLegacy: { mp3: 809 }, files: ['A Mix.mp3', 'A Mix.flac'] },
				id: 'a-mix',
			}),
		];

		expect(validateDownloadsLegacy(mixes).status).toBe('pass');
	});

	test('fails on a count whose format is gone from `files`, naming it', () => {
		const mixes = [
			makeEntry({
				data: { downloadsLegacy: { flac: 7963, mp3: 24_359 }, files: ['A Mix.mp3'] },
				filePath: 'collections/mixes/2015/a-mix.mdx',
				id: 'a-mix',
			}),
		];

		expect(validateDownloadsLegacy(mixes)).toEqual({
			issues: [
				{
					message:
						'collections/mixes/2015/a-mix.mdx: `downloadsLegacy.flac` has no matching file in `files`',
				},
			],
			status: 'fail',
			summary: 'Found 1 orphaned legacy download count(s)',
		});
	});
});
