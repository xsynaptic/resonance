import { describe, expect, test } from 'vitest';

import { collectLinkIdIssues } from './link-ids.js';
import { makeEntry } from './validate-test-utils.js';

const targets = [makeEntry({ id: 'shpongle' }), makeEntry({ id: 'twisted' })];

describe('collectLinkIdIssues', () => {
	test('accepts a link whose id resolves', () => {
		const entries = [
			makeEntry({ body: 'Released on <Link id="twisted">Twisted</Link>.', id: 'a-post' }),
		];

		expect(collectLinkIdIssues(entries, targets)).toEqual([]);
	});

	test('flags a link whose id resolves to nothing, with its line number', () => {
		const entries = [
			makeEntry({
				body: 'First line.\n\nSee <Link id="nobody">nobody</Link>.',
				filePath: 'collections/posts/2011/a-post.mdx',
				id: 'a-post',
			}),
		];

		expect(collectLinkIdIssues(entries, targets)).toEqual([
			{ id: 'nobody', lineNumber: 3, location: 'collections/posts/2011/a-post.mdx' },
		]);
	});

	test('reads a self-closing link', () => {
		const entries = [
			makeEntry({
				body: '<Link id="twisted" />\n<Link id="nobody" />',
				filePath: 'collections/posts/2011/a-post.mdx',
				id: 'a-post',
			}),
		];

		expect(collectLinkIdIssues(entries, targets)).toEqual([
			{ id: 'nobody', lineNumber: 2, location: 'collections/posts/2011/a-post.mdx' },
		]);
	});

	test('skips an entry with no body and one with no Link at all', () => {
		const entries = [
			makeEntry({ id: 'an-artist' }),
			makeEntry({ body: 'Plain prose.', id: 'a-post' }),
		];

		expect(collectLinkIdIssues(entries, targets)).toEqual([]);
	});
});
