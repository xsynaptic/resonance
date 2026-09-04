import { describe, expect, test } from 'vitest';

import { collectLinkIdIssues, validateLinkIds } from './link-ids.js';
import { makeEntry } from './validate-test-utils.js';

const rootPath = import.meta.dirname;

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

	test('reads a single-quoted id', () => {
		const entries = [makeEntry({ body: "<Link id='nobody' />", id: 'a-post' })];

		expect(collectLinkIdIssues(entries, targets).map((issue) => issue.id)).toEqual(['nobody']);
	});

	test('does not read a `data-id` prop as a link id', () => {
		const entries = [makeEntry({ body: '<Link data-id="nobody">text</Link>', id: 'a-post' })];

		expect(collectLinkIdIssues(entries, targets)).toEqual([]);
	});
});

describe('validateLinkIds', () => {
	test('reports a line number that points at the file, not the body', () => {
		const body = [
			'Prose above the component.',
			'',
			'<Link>no id here</Link>',
			'',
			'<Link id="a-missing-target">a dangling id</Link>',
			'',
		].join('\n');
		const entries = [makeEntry({ body, filePath: 'fixtures/offset-sample.mdx', id: 'a-post' })];

		const result = validateLinkIds(entries, targets, rootPath);

		expect(result.issues[0]?.details).toEqual(['Line 11: broken link ID "a-missing-target"']);
	});
});
