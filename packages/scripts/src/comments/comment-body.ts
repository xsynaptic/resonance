// WordPress stored comment bodies as HTML: a tag whitelist plus entity-escaped literal characters
// Tags are converted before entities are decoded, so a literal `&lt;` never reads as markup
// Output targets the five-rule renderer in comment-markdown-spec.md: emphasis, link, linkify,
// backticks, newline; anything outside that set is emitted as the plain text it degrades to

const entities: Record<string, string> = {
	'&#039;': "'",
	'&amp;': '&',
	'&gt;': '>',
	'&lt;': '<',
	'&nbsp;': ' ',
	'&quot;': '"',
};

export function convertCommentBody(input: string): string {
	const codeBlocks: Array<string> = [];

	// Pulled out first so the tag and entity passes below never touch code content
	let body = input
		.replaceAll('\r\n', '\n')
		.replaceAll(/<pre><code>\s*([\s\S]*?)\s*<\/code><\/pre>/g, (_match, code: string) => {
			codeBlocks.push(decodeEntities(code));
			return `\n\n%%CODE${String(codeBlocks.length - 1)}%%\n\n`;
		});

	body = convertList(body);
	body = convertBlockquote(body);
	body = body.replaceAll(
		/<a\s+href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/g,
		(_match, href: string, text: string) => `[${text}](${href})`,
	);
	body = body.replaceAll(/<em>([\s\S]*?)<\/em>/g, (_match, text: string) => `*${text}*`);
	// WP rendered a single newline as a break, so the newline alone carries what <br> meant
	body = body.replaceAll(/<br\s*\/?>\n?/g, '\n');
	body = decodeEntities(body);

	// Unwrapped rather than fenced: the renderer has no fence rule, and ``` there would collapse
	// the block onto one line; plain lines keep their breaks, losing only the monospace
	body = body.replaceAll(
		/%%CODE(\d+)%%/g,
		(_match, index: string) => codeBlocks[Number(index)] ?? '',
	);

	return body
		.replaceAll(/[ \t]+$/gm, '')
		.replaceAll(/\n{3,}/g, '\n\n')
		.trim();
}

export function findResidualMarkup(body: string): Array<string> {
	const tags = [...body.matchAll(/<\/?[a-zA-Z][a-zA-Z0-9]*[^>]*>/g)];
	const escapes = [...body.matchAll(/&[#a-zA-Z0-9]+;/g)];

	return [...tags, ...escapes].map((match) => match[0]);
}

function convertBlockquote(input: string): string {
	return input.replaceAll(
		/<blockquote>\s*([\s\S]*?)\s*<\/blockquote>/g,
		(_match, quoted: string) => {
			const lines = quoted.split('\n').map((line) => `> ${line.trim()}`);
			return `\n\n${lines.join('\n')}\n\n`;
		},
	);
}

function convertList(input: string): string {
	return input
		.replaceAll(/<li>\s*([\s\S]*?)\s*<\/li>/g, (_match, item: string) => `- ${item}`)
		.replaceAll(/\s*<\/?ul>\s*/g, '\n\n');
}

function decodeEntities(input: string): string {
	return input
		.replaceAll(/&(?:#039|amp|gt|lt|nbsp|quot);/g, (match) => entities[match] ?? match)
		.replaceAll(/&#(\d+);/g, (_match, code: string) => String.fromCodePoint(Number(code)));
}
