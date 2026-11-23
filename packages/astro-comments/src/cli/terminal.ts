import { once } from 'node:events';
import { styleText } from 'node:util';

import type { StoredComment } from '#store.ts';

// Raw mode swallows SIGINT, so ctrl-c arrives as a keystroke
const interrupt = '\u{3}';

const bodyWidth = 76;

const unprintable = /(?!\n)[\p{Cc}\p{Bidi_Control}]/gu;

// Visitor text could otherwise rewrite the screen or reorder what the moderator reads
export function toPrintable(text: string): string {
	return text.replaceAll(unprintable, '');
}

export function printComment(stored: StoredComment, marker: string): void {
	const comment = toPrintableComment(stored);
	const identity = [
		styleText('bold', comment.author),
		comment.authorEmail === undefined ? undefined : styleText('dim', `<${comment.authorEmail}>`),
		comment.authorUrl === undefined
			? undefined
			: styleText(['blue', 'underline'], comment.authorUrl),
	].filter((part) => part !== undefined);
	const meta = [
		`${new Date(comment.createdAt * 1000).toISOString().slice(0, 16).replace('T', ' ')} UTC`,
		comment.id,
		comment.parentId === undefined ? undefined : `reply to ${comment.parentId}`,
	].filter((part) => part !== undefined);

	console.log(
		[
			'',
			`  ${marker}  ${styleText('cyan', comment.thread)}`,
			styleText('dim', `  ${'─'.repeat(bodyWidth)}`),
			`  ${identity.join('  ')}`,
			styleText('dim', `  ${meta.join(' · ')}`),
			'',
			...wrapBody(comment.body).map((line) => (line === '' ? '' : `  ${line}`)),
			'',
		].join('\n'),
	);
}

export function printLegend(choices: ReadonlyArray<{ key: string; label: string }>): void {
	const legend = choices.map(
		(choice) => `${styleText('bold', choice.key)} ${styleText('dim', choice.label)}`,
	);

	console.log(`  ${legend.join(' '.repeat(3))}`);
}

// Resolves undefined on ctrl-c, which every caller reads as quit
export async function readKey(keys: ReadonlyArray<string>): Promise<string | undefined> {
	const { stdin } = process;

	if (!stdin.isTTY) throw new Error('This prompt needs an interactive terminal');

	stdin.setRawMode(true);
	stdin.resume();
	stdin.setEncoding('utf8');

	try {
		for (;;) {
			const [key] = (await once(stdin, 'data')) as [string];

			if (key === interrupt) return undefined;
			if (keys.includes(key)) return key;
		}
	} finally {
		stdin.setRawMode(false);
		stdin.pause();
	}
}

function toPrintableComment(comment: StoredComment): StoredComment {
	const printable = { ...comment };

	for (const key of [
		'author',
		'authorEmail',
		'authorUrl',
		'body',
		'id',
		'parentId',
		'thread',
	] as const) {
		const value = printable[key];

		if (value !== undefined) printable[key] = toPrintable(value);
	}

	return printable;
}

function wrapBody(body: string): Array<string> {
	const lines: Array<string> = [];

	for (const paragraph of body.split('\n')) {
		if (paragraph.trim() === '') {
			lines.push('');
			continue;
		}

		let current = '';

		for (const word of paragraph.split(/\s+/)) {
			if (current === '') current = word;
			else if (current.length + word.length + 1 <= bodyWidth) current += ` ${word}`;
			else {
				lines.push(current);
				current = word;
			}
		}

		lines.push(current);
	}

	return lines;
}
