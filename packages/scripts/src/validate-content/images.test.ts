import { describe, expect, test } from 'vitest';

import { collectMissingImageIssues } from '#validate-content/images.ts';
import { makeEntry } from '#validate-content/validate-test-utils.ts';

const mediaFiles = new Set(['2010/04/cover.jpg', '2015/11/original.jpg']);

describe('collectMissingImageIssues', () => {
	test('accepts frontmatter, nested selection and body references that exist', () => {
		const entries = [
			makeEntry({
				body: '<Img src="2015/11/original.jpg">Original scale</Img>',
				data: {
					imageFeatured: '2010/04/cover.jpg',
					selections: [{ imageFeatured: '2015/11/original.jpg' }],
				},
				id: 'a-post',
			}),
		];

		expect(collectMissingImageIssues(entries, mediaFiles)).toEqual([]);
	});

	test('reports each reference with no file behind it', () => {
		const entries = [
			makeEntry({
				body: '<Img src="2011/01/gone.jpg" />',
				data: { imageFeatured: [{ hero: true, id: '2010/04/typo.jpg' }] },
				filePath: 'collections/posts/2011/a-post.mdx',
				id: 'a-post',
			}),
		];

		expect(collectMissingImageIssues(entries, mediaFiles)).toEqual([
			{ imagePath: '2010/04/typo.jpg', location: 'collections/posts/2011/a-post.mdx' },
			{ imagePath: '2011/01/gone.jpg', location: 'collections/posts/2011/a-post.mdx' },
		]);
	});

	test('ignores a data- prop and a longer tag name that merely starts with Img', () => {
		const entries = [
			makeEntry({
				body: '<Img data-src="2011/01/gone.jpg" />\n<ImgGroup src="2011/01/group.jpg" />',
				id: 'a-post',
			}),
		];

		expect(collectMissingImageIssues(entries, mediaFiles)).toEqual([]);
	});

	test('reads a single-quoted src', () => {
		const entries = [makeEntry({ body: "<Img src='2011/01/gone.jpg' />", id: 'a-post' })];

		expect(collectMissingImageIssues(entries, mediaFiles)).toEqual([
			{ imagePath: '2011/01/gone.jpg', location: 'a-post' },
		]);
	});
});
