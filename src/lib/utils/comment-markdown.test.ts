/* eslint-disable unicorn/prefer-https -- `http:` is an allowed scheme, so the fixtures must cover it */
import { describe, expect, test } from 'vitest';

import { isSafeUrl, renderCommentBody, toAuthorHref } from './comment-markdown.ts';

const allowedTags = new Set(['a', 'br', 'code', 'em', 'p', 'strong']);

const authorHrefCases: Array<[string, string | undefined]> = [
	['https://example.com/', 'https://example.com/'],
	['http://example.com', 'http://example.com/'],
	['/relative/path/', undefined],
	['example.com', undefined],
	['//evil.com', undefined],
	['javascript:alert(1)', undefined],
	['mailto:a@b.com', undefined],
];

// Fixture cases from `.claude/tasks/comment-markdown-spec.md`, which is the contract
const injectionCases: Array<[string, string]> = [
	['hello <script>alert(1)</script>', '<p>hello &lt;script&gt;alert(1)&lt;/script&gt;</p>'],
	['<img src=x onerror=alert(1)>', '<p>&lt;img src=x onerror=alert(1)&gt;</p>'],
	['[x](javascript:alert(1))', '<p>[x](javascript:alert(1))</p>'],
	['[x](JaVaScRiPt:alert(1))', '<p>[x](JaVaScRiPt:alert(1))</p>'],
	['[x](&#x6a;avascript:alert(1))', '<p>[x](&amp;#x6a;avascript:alert(1))</p>'],
	['[x](data:text/html;base64,PHNjcmlwdD4=)', '<p>[x](data:text/html;base64,PHNjcmlwdD4=)</p>'],
	['[x](vbscript:msgbox(1))', '<p>[x](vbscript:msgbox(1))</p>'],
	['[x](" onmouseover="alert(1))', '<p>[x](" onmouseover="alert(1))</p>'],
	['[x](//evil.com)', '<p>[x](//evil.com)</p>'],
	['[x](mailto:a@b.com)', '<p>[x](mailto:a@b.com)</p>'],
	['a<b and c>d', '<p>a&lt;b and c&gt;d</p>'],
];

const markupBodies = [
	'<script>alert(1)</script>',
	'<h1>heading</h1>',
	'<table><tr><td>x</td></tr></table>',
	'<iframe src="https://evil.com"></iframe>',
	'<style>body{display:none}</style>',
	'<svg onload=alert(1)></svg>',
	'# h\n\n- li\n\n> q\n\n| a | b |\n\n![alt](https://x/a.png)',
];

const safeUrlCases: Array<[string, boolean]> = [
	['https://example.com/', true],
	['http://example.com/', true],
	['/relative/path/', true],
	['//evil.com', false],
	['mailto:a@b.com', false],
	['javascript:alert(1)', false],
	['data:text/html;base64,PHNjcmlwdD4=', false],
	['vbscript:msgbox(1)', false],
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
	[String.raw`\[not link\](y)`, '<p>[not link](y)</p>'],
	['5 * 3 * 2', '<p>5 * 3 * 2</p>'],
	['snake_case_word', '<p>snake_case_word</p>'],
	['__init__', '<p><strong>init</strong></p>'],
	['*unclosed', '<p>*unclosed</p>'],
	['# h', '<p># h</p>'],
	['- li', '<p>- li</p>'],
	['> q', '<p>&gt; q</p>'],
	['| a | b |', '<p>| a | b |</p>'],
	[
		'![alt](https://x/a.png)',
		'<p>!<a href="https://x/a.png" rel="nofollow ugc noopener">alt</a></p>',
	],
	['```\nfenced\nlines\n```', '<p><code>fenced lines</code></p>'],
	['&amp;', '<p>&amp;amp;</p>'],
	['        indented eight', '<p>indented eight</p>'],
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

	test('every anchor carries the rel allowlist', () => {
		const html = render('[a](https://x/) and https://y.example/');

		expect(html.match(/<a /g)).toHaveLength(2);
		expect(html.match(/rel="nofollow ugc noopener"/g)).toHaveLength(2);
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

	test('undefined passes through', () => {
		expect(toAuthorHref(undefined)).toBeUndefined();
	});
});
