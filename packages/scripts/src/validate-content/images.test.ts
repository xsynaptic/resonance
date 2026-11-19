import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, test } from 'vitest';

import { collectMissingImageIssues, validateImages } from '#validate-content/images.ts';
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
});

async function mediaTree(files: Array<string>): Promise<string> {
	const root = await mkdtemp(path.join(os.tmpdir(), 'validate-images-'));

	for (const file of files) {
		await mkdir(path.dirname(path.join(root, file)), { recursive: true });
		await writeFile(path.join(root, file), '');
	}

	return root;
}

describe('validateImages', () => {
	test('fails a reference to an original set aside under a `_` folder', async () => {
		const mediaPath = await mediaTree(['2010/04/cover.jpg', '_unused/2010/04/old.jpg']);
		const entries = [
			makeEntry({ data: { imageFeatured: '2010/04/cover.jpg' }, id: 'kept' }),
			makeEntry({ data: { imageFeatured: '_unused/2010/04/old.jpg' }, id: 'set-aside' }),
		];

		expect(await validateImages(entries, mediaPath)).toMatchObject({
			issues: [{ location: 'set-aside', message: 'no image file at "_unused/2010/04/old.jpg"' }],
			status: 'fail',
		});
	});

	test('warns rather than fails when the media tree holds no images', async () => {
		const entries = [makeEntry({ data: { imageFeatured: '2010/04/cover.jpg' }, id: 'a-post' })];

		expect(await validateImages(entries, await mediaTree([]))).toMatchObject({
			issues: [],
			status: 'warn',
		});
	});
});
