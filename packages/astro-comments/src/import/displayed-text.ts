import { Parser } from 'htmlparser2';

export type TextStructure = 'markup' | 'newlines';

// `newlines` reads structure as wpautop does from a stored WordPress body; `markup` reads it from `<p>` and `<br>`
export function toDisplayedText(html: string, structure: TextStructure): string {
	let text = '';
	const parser = new Parser(
		{
			onopentag(name) {
				if (structure === 'newlines') return;

				if (name === 'br') text += '\n';
				else if (name === 'p') text += '\n\n';
			},
			ontext(chunk) {
				text += structure === 'markup' ? chunk.replaceAll('\n', ' ') : chunk;
			},
		},
		{ decodeEntities: true },
	);

	parser.write(html.replaceAll('\r\n', '\n'));
	parser.end();

	return normalizeStructure(text);
}

export function normalizeStructure(text: string): string {
	return text
		.split(/\n[ \t\f\r]*\n/)
		.map((paragraph) =>
			paragraph
				.split('\n')
				.map((line) => line.replaceAll(/[ \t\f\r]+/g, ' ').trim())
				.join('\n')
				.trim(),
		)
		.filter((paragraph) => paragraph !== '')
		.join('\n\n');
}
