import { Parser } from 'htmlparser2';
import MarkdownIt from 'markdown-it';

import { normalizeStructure, toDisplayedText } from '#import/displayed-text.ts';
import { renderCommentBody, toAuthorHref } from '#render/comment-body.ts';

interface Frame {
	content: string;
	tag: string;
	wrap: ((inner: string) => string) | undefined;
}

const markdownCharacters = /[\\`*_[\]]/g;

const escapedCharacters = /\\([\\`*_[\]])/g;

// The renderer's linkify reads a bare URL verbatim, backslashes included, so bare URLs become explicit links
const linkify = new MarkdownIt('zero').linkify;

// Formatting markdown cannot hold falls back to plain text, so no reader sees a stray `*`
export function htmlToCommentMarkdown(html: string): string {
	const source = html.replaceAll('\r\n', '\n');
	const formatted = convert(source, true);

	if (
		toDisplayedText(renderCommentBody(formatted), 'markup') === toDisplayedText(source, 'newlines')
	) {
		return formatted;
	}

	return convert(source, false);
}

function convert(source: string, isFormatted: boolean): string {
	const frames: Array<Frame> = [{ content: '', tag: '', wrap: undefined }];
	let pendingText = '';

	// The parser may split one run of text around an entity, which would split a URL in it
	function flushText(): void {
		const frame = frames.at(-1);

		if (!frame || pendingText === '') return;

		const isCode = isFormatted && frames.some((candidate) => candidate.tag === 'code');

		frame.content += isCode ? pendingText : escapeText(pendingText);
		pendingText = '';
	}

	const parser = new Parser(
		{
			onclosetag() {
				flushText();

				const frame = frames.length > 1 ? frames.pop() : undefined;
				const parent = frames.at(-1);

				if (!frame || !parent) return;

				parent.content += frame.wrap ? frame.wrap(frame.content) : frame.content;
			},
			onopentag(name, attributes) {
				flushText();
				frames.push({
					content: '',
					tag: name,
					wrap: isFormatted ? toWrapper(name, attributes) : undefined,
				});
			},
			ontext(text) {
				pendingText += text;
			},
		},
		{ decodeEntities: true },
	);

	parser.write(source);
	parser.end();
	flushText();

	return settleAutolinks(normalizeStructure(frames.map((frame) => frame.content).join('')));
}

function escapeText(text: string): string {
	let escaped = '';
	let position = 0;

	const links = linkify.match(text) ?? [];

	for (const link of links) {
		const href = toAuthorHref(link.url);

		if (href === undefined) continue;

		escaped += escapeMarkdown(text.slice(position, link.index));
		escaped += `[${escapeMarkdown(link.raw)}](${toLinkDestination(href)})`;
		position = link.lastIndex;
	}

	return escaped + escapeMarkdown(text.slice(position));
}

function escapeMarkdown(text: string): string {
	return text.replaceAll(markdownCharacters, String.raw`\$&`);
}

function toLinkDestination(href: string): string {
	return href.replaceAll('(', '%28').replaceAll(')', '%29');
}

function readAutolinkTexts(html: string): Array<string> {
	const texts: Array<string> = [];
	let current: string | undefined;
	const parser = new Parser({
		onclosetag(name) {
			if (name === 'a' && current !== undefined) texts.push(current);
			if (name === 'a') current = undefined;
		},
		onopentag(name) {
			if (name === 'a') current = '';
		},
		ontext(text) {
			if (current !== undefined) current += text;
		},
	});

	parser.write(html);
	parser.end();

	return texts.filter((text) => !/\s/.test(text) && linkify.test(text));
}

// Linkify takes an escape a URL runs into as part of the URL
function settleAutolinks(markdown: string): string {
	let settled = markdown;

	for (let pass = 0; pass < 8; pass += 1) {
		const absorbed = readAutolinkTexts(renderCommentBody(settled)).filter((text) =>
			text.includes('\\'),
		);
		const previous = settled;

		for (const text of absorbed) {
			const withFollowingEscape = new RegExp(`${RegExp.escape(text)}[\\\\\`*_[\\]]?`, 'g');

			settled = settled.replaceAll(withFollowingEscape, (span) =>
				span.replaceAll(escapedCharacters, '$1'),
			);
		}

		if (settled === previous) break;
	}

	return settled;
}

function toCodeSpan(inner: string): string {
	const longestRun = Math.max(0, ...(inner.match(/`+/g) ?? []).map((run) => run.length));
	const fence = '`'.repeat(longestRun + 1);
	const padding = inner.startsWith('`') || inner.endsWith('`') ? ' ' : '';

	return `${fence}${padding}${inner}${padding}${fence}`;
}

function toWrapper(
	name: string,
	attributes: Record<string, string>,
): ((inner: string) => string) | undefined {
	if (name === 'b' || name === 'strong') return (inner) => wrapTrimmed(inner, '**', '**');

	if (name === 'i' || name === 'em') return (inner) => wrapTrimmed(inner, '*', '*');

	if (name === 'code') return (inner) => (inner.trim() === '' ? inner : toCodeSpan(inner));

	if (name !== 'a') return undefined;

	const href = toAuthorHref(attributes.href);

	if (href === undefined) return undefined;

	return (inner) => wrapTrimmed(inner, '[', `](${toLinkDestination(href)})`);
}

// Markdown will not open emphasis next to whitespace, so it moves outside the markers
function wrapTrimmed(inner: string, open: string, close: string): string {
	const match = /^(\s*)([\s\S]*?)(\s*)$/.exec(inner);
	const [, leading = '', core = '', trailing = ''] = match ?? [];

	if (core === '') return inner;

	return `${leading}${open}${core}${close}${trailing}`;
}
