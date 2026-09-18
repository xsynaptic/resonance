import { describe, expect, test } from 'vitest';

import { isSafeUrl, renderCommentBody, toAuthorHref } from '#lib/utils/comment-markdown.ts';

const allowedTags = new Set(['a', 'br', 'code', 'em', 'p', 'strong']);

const authorHrefCases: Array<[string, string | undefined]> = [
	['https://example.com/', 'https://example.com/'],
	['/relative/path/', undefined],
	['//evil.com', undefined],
	['javascript:alert(1)', undefined],
];

// Fixture cases from `.claude/tasks/comment-markdown-spec.md`, which is the contract
const injectionCases: Array<[string, string]> = [
	['hello <script>alert(1)</script>', '<p>hello &lt;script&gt;alert(1)&lt;/script&gt;</p>'],
	['<img src=x onerror=alert(1)>', '<p>&lt;img src=x onerror=alert(1)&gt;</p>'],
	['[x](javascript:alert(1))', '<p>[x](javascript:alert(1))</p>'],
	['[x](JaVaScRiPt:alert(1))', '<p>[x](JaVaScRiPt:alert(1))</p>'],
	['[x](&#x6a;avascript:alert(1))', '<p>[x](&amp;#x6a;avascript:alert(1))</p>'],
	['[x](data:text/html;base64,PHNjcmlwdD4=)', '<p>[x](data:text/html;base64,PHNjcmlwdD4=)</p>'],
	['[x](" onmouseover="alert(1))', '<p>[x](" onmouseover="alert(1))</p>'],
	['[x](//evil.com)', '<p>[x](//evil.com)</p>'],
];

const markupBodies = [
	'<svg onload=alert(1)></svg>',
	'# h\n\n- li\n\n> q\n\n| a | b |\n\n![alt](https://x/a.png)',
];

const safeUrlCases: Array<[string, boolean]> = [
	['https://example.com/', true],
	['/relative/path/', true],
	['//evil.com', false],
	['javascript:alert(1)', false],
];

const syntaxCases: Array<[string, string]> = [
	['a *bows* b', '<p>a <em>bows</em> b</p>'],
	['a **b** c', '<p>a <strong>b</strong> c</p>'],
	['a `code` b', '<p>a <code>code</code> b</p>'],
	['line1\nline2', '<p>line1<br />\nline2</p>'],
	['line1\n\nline2', '<p>line1</p>\n<p>line2</p>'],
	['[t](http://x/)', '<p><a href="http://x/" rel="nofollow ugc noopener">t</a></p>'],
	[
		'see https://x.com now',
		'<p>see <a href="https://x.com" rel="nofollow ugc noopener">https://x.com</a> now</p>',
	],
	[String.raw`\*not em\*`, '<p>*not em*</p>'],
	['5 * 3 * 2', '<p>5 * 3 * 2</p>'],
	['snake_case_word', '<p>snake_case_word</p>'],
	['# h', '<p># h</p>'],
	[
		'![alt](https://x/a.png)',
		'<p>!<a href="https://x/a.png" rel="nofollow ugc noopener">alt</a></p>',
	],
	['```\nfenced\nlines\n```', '<p><code>fenced lines</code></p>'],
	['&amp;', '<p>&amp;amp;</p>'],
];

function render(body: string): string {
	return renderCommentBody(body).trim();
}

describe('renderCommentBody injection vectors', () => {
	test.for(injectionCases)('%j renders inert', ([input, expected]) => {
		expect(render(input)).toBe(expected);
	});
});

describe('renderCommentBody syntax', () => {
	test.for(syntaxCases)('%j renders as specified', ([input, expected]) => {
		expect(render(input)).toBe(expected);
	});
});

describe('renderCommentBody tag allowlist', () => {
	test.for(markupBodies)('%j emits no tag outside the allowlist', (body) => {
		const tags = [...render(body).matchAll(/<\/?([a-z][a-z\d]*)/gi)].map((match) =>
			match[1]!.toLowerCase(),
		);

		expect(tags.filter((tag) => !allowedTags.has(tag))).toEqual([]);
	});

	test('every href uses http or https', () => {
		const html = render('[a](https://x/) [b](http://y/) [c](mailto:z@w) plain https://q.example/');

		expect([...html.matchAll(/href="([^"]*)"/g)].map((match) => match[1])).toEqual([
			'https://x/',
			'http://y/',
			'https://q.example/',
		]);
	});
});

describe('isSafeUrl', () => {
	test.for(safeUrlCases)('%j', ([url, expected]) => {
		expect(isSafeUrl(url)).toBe(expected);
	});
});

describe('toAuthorHref', () => {
	test.for(authorHrefCases)('%j', ([url, expected]) => {
		expect(toAuthorHref(url)).toBe(expected);
	});
});
