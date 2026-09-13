import { createSatteriMarkdownProcessor } from '@astrojs/markdown-satteri';

const entities: Record<string, string> = {
	'&#39;': "'",
	'&amp;': '&',
	'&gt;': '>',
	'&lt;': '<',
	'&quot;': '"',
};

// Bare inline-markdown processor for list-item descriptions, NOT the astro.config MDX pipeline
// So <Link>/<Img> render as literal text; memoized, since building one is expensive
type Processor = Awaited<ReturnType<typeof createSatteriMarkdownProcessor>>;

let processorPromise: Promise<Processor> | undefined;

export async function renderMarkdown(text: string): Promise<string> {
	const processor = await getProcessor();
	const { code } = await processor.render(text);
	return code;
}

// Render markdown then strip HTML for the excerpt; regex-stripping raw markdown mangles literal #, *, _
// Block closers become a space and inline tags nothing, so `<em>x</em>'s` keeps its apostrophe attached
export async function toExcerpt(markdown: string, maxLength = 160): Promise<string> {
	const html = await renderMarkdown(markdown);
	const text = html
		.replaceAll(/<\/(?:p|li|h[1-6]|blockquote|div|dd|dt|td|th)>|<br\s*\/?>/g, ' ')
		.replaceAll(/<[^>]+>/g, '')
		.replaceAll(/&#39;|&amp;|&gt;|&lt;|&quot;/g, (match) => entities[match] ?? match)
		.replaceAll(/\s+/g, ' ')
		.trim();
	if (text.length <= maxLength) return text;
	return `${text.slice(0, maxLength).replace(/\s+\S*$/, '')}…`;
}

async function getProcessor(): Promise<Processor> {
	if (!processorPromise) processorPromise = createSatteriMarkdownProcessor({});
	return processorPromise;
}
