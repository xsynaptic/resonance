import { describe, expect, test } from 'vitest';

import { validateBodyMarkers } from '#validate-content/body-markers.ts';
import { makeEntry } from '#validate-content/validate-test-utils.ts';

describe('validateBodyMarkers', () => {
	test('passes when each field has its tag and each tag has its field', () => {
		const entries = [
			makeEntry({
				body: 'Prose.\n\n<TrackList tracks={frontmatter.tracks} />',
				data: { tracks: [{ title: 'Alpha Sector' }] },
				id: 'a-mix',
			}),
			makeEntry({ body: 'Prose only.', data: {}, id: 'a-post' }),
		];

		expect(validateBodyMarkers(entries).status).toBe('pass');
	});

	test('fails on frontmatter the body never renders', () => {
		const entries = [
			makeEntry({
				body: 'Prose only.',
				data: { selections: [{ title: 'A Release' }] },
				filePath: 'collections/posts/2008/a-list.mdx',
				id: 'a-list',
			}),
		];

		expect(validateBodyMarkers(entries)).toEqual({
			issues: [
				{ message: 'collections/posts/2008/a-list.mdx: selections with no <Selections> tag' },
			],
			status: 'fail',
			summary: 'Found 1 entry body marker mismatch(es)',
		});
	});

	test('fails on a tag with nothing behind it', () => {
		const entries = [
			makeEntry({
				body: '<TrackList tracks={frontmatter.tracks} />',
				data: {},
				filePath: 'collections/mixes/2017/a-mix.mdx',
				id: 'a-mix',
			}),
		];

		expect(validateBodyMarkers(entries).issues).toEqual([
			{ message: 'collections/mixes/2017/a-mix.mdx: <TrackList> tag with no tracks' },
		]);
	});
});
