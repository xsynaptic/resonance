import { createSatteriMarkdownProcessor } from '@astrojs/markdown-satteri';
import pMemoize from 'p-memoize';
import sanitizeHtml from 'sanitize-html';

const entities: Record<string, string> = {
	'&#39;': "'",
	'&amp;': '&',
	'&gt;': '>',
	'&lt;': '<',
	'&quot;': '"',
};

// Bare inline-markdown processor for list-item descriptions, NOT the astro.config MDX pipeline
// So <Link>/<Img> render as literal text; memoized, since building one is expensive
const getProcessor = pMemoize(async () => createSatteriMarkdownProcessor({}));

export async function renderMarkdown(text: string): Promise<string> {
	const processor = await getProcessor();
	const { code } = await processor.render(text);
	return code;
}

// Render markdown then strip HTML for the excerpt; regex-stripping raw markdown mangles literal #, *, _
// Block closers become a space and inline tags nothing, so `<em>x</em>'s` keeps its apostrophe attached
// Tags are stripped with a real parser because attribute values can contain `>`
export async function toExcerpt(markdown: string, maxLength = 160): Promise<string> {
	const html = await renderMarkdown(markdown);
	const spaced = html.replaceAll(/<\/(?:p|li|h[1-6]|blockquote|div|dd|dt|td|th)>|<br\s*\/?>/g, ' ');
	const text = sanitizeHtml(spaced, { allowedAttributes: {}, allowedTags: [] })
		.replaceAll(/&#39;|&amp;|&gt;|&lt;|&quot;/g, (match) => entities[match] ?? match)
		.replaceAll(/\s+/g, ' ')
		.trim();
	if (text.length <= maxLength) return text;
	return `${clipToWord(text, maxLength)}…`;
}

// Look one character past the limit so a word ending right on it survives
function clipToWord(text: string, maxLength: number): string {
	const clipped = text.slice(0, maxLength + 1).replace(/\s+\S*$/, '');
	if (clipped.length <= maxLength) return clipped;

	const hardCut = text.slice(0, maxLength);

	return /[\uD800-\uDBFF]$/.test(hardCut) ? hardCut.slice(0, -1) : hardCut;
}
