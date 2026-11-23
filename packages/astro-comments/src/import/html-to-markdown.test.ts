import { fc, test } from '@fast-check/vitest';
import { describe, expect } from 'vitest';

import { toDisplayedText } from '#import/displayed-text.ts';
import { htmlToCommentMarkdown } from '#import/html-to-markdown.ts';
import { renderCommentBody } from '#render/comment-body.ts';

function displayedAfterImport(html: string): string {
	return toDisplayedText(renderCommentBody(htmlToCommentMarkdown(html)), 'markup');
}

const textPiece = fc.oneof(
	fc.string({
		unit: fc.constantFrom(
			'a',
			'b',
			' ',
			'\n',
			'*',
			'_',
			'`',
			'[',
			']',
			'\\',
			'(',
			')',
			'!',
			'#',
			'-',
			'1',
			'.',
			'>',
			'~',
		),
	}),
	fc.constantFrom(
		'&amp;',
		'&lt;',
		'&gt;',
		'&quot;',
		'&#039;',
		'&#8217;',
		'&nbsp;',
		'&copy;',
		'https://example.test/a_b',
		'\n\n',
		'  ',
	),
);

const html: fc.Arbitrary<string> = fc.letrec((tie) => ({
	node: fc.oneof(
		{ depthSize: 'small', withCrossShrink: true },
		textPiece,
		fc
			.tuple(
				fc.constantFrom('b', 'strong', 'i', 'em', 'code', 'q', 'blockquote', 'del'),
				fc.array(tie('node'), { maxLength: 3 }),
			)
			.map(([tag, children]) => `<${tag}>${children.join('')}</${tag}>`),
		fc
			.tuple(
				fc.constantFrom(
					'https://example.test/(x)',
					'javascript:alert(1)',
					'/relative',
					'mailto:a@b.test',
				),
				fc.array(tie('node'), { maxLength: 3 }),
			)
			.map(([href, children]) => `<a href="${href}" rel="nofollow">${children.join('')}</a>`),
	),
})).node;

describe('htmlToCommentMarkdown', () => {
	test('maps links, bold, italics and code to the comment subset', () => {
		expect(
			htmlToCommentMarkdown(
				'<strong>Bold</strong>, <i>italic</i>, <code>a*b</code> and <a href="https://example.test/page" rel="nofollow">a link</a>',
			),
		).toBe('**Bold**, *italic*, `a*b` and [a link](https://example.test/page)');
	});

	test('decodes entities and escapes what markdown would read as syntax', () => {
		expect(htmlToCommentMarkdown('Tom &amp; Jerry&#8217;s *stars* and_underscores_ [1]')).toBe(
			String.raw`Tom & Jerry’s \*stars\* and\_underscores\_ \[1\]`,
		);
	});

	test('keeps paragraphs and line breaks, and drops tags outside the subset to their text', () => {
		expect(
			htmlToCommentMarkdown('First line\nsecond line\r\n\r\n<blockquote>Quoted</blockquote>'),
		).toBe('First line\nsecond line\n\nQuoted');
	});

	test('drops a link it would not render, keeping its text', () => {
		expect(htmlToCommentMarkdown('<a href="javascript:alert(1)">click</a>')).toBe('click');
	});

	test('moves whitespace out of emphasis so the markers still open', () => {
		expect(htmlToCommentMarkdown('a<b> bold </b>b')).toBe('a **bold** b');
	});

	test.prop([html], { numRuns: 500 })('renders the text WordPress displayed', (body) => {
		expect(displayedAfterImport(body)).toBe(toDisplayedText(body, 'newlines'));
	});
});
