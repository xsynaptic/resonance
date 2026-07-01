import { renderMarkdown } from '#lib/utils/markdown.ts';

const entities: Record<string, string> = {
	'&#39;': "'",
	'&amp;': '&',
	'&gt;': '>',
	'&lt;': '<',
	'&quot;': '"',
};

// Plain-text excerpt for meta descriptions: render markdown properly, then strip HTML rather than
// regex-stripping raw markdown (which mangles literal #, *, _ in prose)
export async function toExcerpt(markdown: string, maxLength = 160): Promise<string> {
	const html = await renderMarkdown(markdown);
	const text = html
		.replaceAll(/<[^>]+>/g, ' ')
		.replaceAll(/&#39;|&amp;|&gt;|&lt;|&quot;/g, (match) => entities[match] ?? match)
		.replaceAll(/\s+/g, ' ')
		.trim();
	if (text.length <= maxLength) return text;
	return `${text.slice(0, maxLength).replace(/\s+\S*$/, '')}…`;
}
