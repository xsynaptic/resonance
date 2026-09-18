import { describe, expect, test } from 'vitest';

import { collectComponentIssues, validateMdxComponents } from '#validate-content/mdx.ts';
import { makeEntry } from '#validate-content/validate-test-utils.ts';

const rootPath = import.meta.dirname;

describe('collectComponentIssues', () => {
	test('accepts components carrying their required prop', () => {
		const body = [
			'Released on <Link id="techgnosis-records">Techgnosis</Link>.',
			'<Img src="covers/artwork.jpg">A caption</Img>',
			'<Link id="dj-basilisk" />',
			'<Quotation author="Erik Davis" title="Hedonic Tantra" year="2004">',
		].join('\n');

		expect(collectComponentIssues(body)).toEqual([]);
	});

	test('flags a Link with no props at all', () => {
		expect(collectComponentIssues('See <Link>this label</Link>.')).toEqual([
			{
				context: 'See <Link>this label</Link>.',
				lineNumber: 1,
				message: 'Link component missing id prop',
			},
		]);
	});

	test('flags a Quotation carrying a title but no author', () => {
		const issues = collectComponentIssues('<Quotation title="Neuromancer" year="1982">');

		expect(issues).toHaveLength(1);
		expect(issues[0]?.message).toBe('Quotation component missing author prop');
	});
});

describe('validateMdxComponents', () => {
	test('reports the file and skips an entry with no body', () => {
		const entries = [
			makeEntry({ id: 'an-artist' }),
			makeEntry({
				body: '<Link>text</Link>',
				filePath: 'collections/posts/2015/a-post.mdx',
				id: 'a-post',
			}),
		];

		const result = validateMdxComponents(entries, rootPath);

		expect(result.status).toBe('fail');
		expect(result.issues).toHaveLength(1);
		expect(result.issues[0]?.message).toBe('collections/posts/2015/a-post.mdx');
	});

	test('reports a line number that points at the file, not the body', () => {
		const entries = [
			makeEntry({
				body: 'Prose above the component.\n\n<Link>no id here</Link>\n',
				filePath: 'fixtures/offset-sample.mdx',
				id: 'a-post',
			}),
		];

		const result = validateMdxComponents(entries, rootPath);

		expect(result.issues[0]?.details?.[0]).toBe('Line 9: Link component missing id prop');
	});
});
