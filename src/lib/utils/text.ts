import { renderMarkdown } from '#lib/utils/markdown.ts';

const entities: Record<string, string> = {
	'&#39;': "'",
	'&amp;': '&',
	'&gt;': '>',
	'&lt;': '<',
	'&quot;': '"',
};

export function formatNumber({
	locales,
	number,
	options,
}: {
	locales?: Intl.LocalesArgument | undefined;
	number: number | string;
	options?: Intl.NumberFormatOptions | undefined;
}) {
	return new Intl.NumberFormat(locales ?? 'en', options).format(Number(number));
}

export function formatStringTemplate(
	template: string,
	values: Record<string, number | string> = {},
): string {
	return template.replaceAll(/\{(\w+)\}/g, (_, key: string) => String(values[key] ?? ''));
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

// Name to slug, matching the extractor's rule so a free-text name lines up with a term's id
export function toSlug(input: string): string {
	return input
		.toLowerCase()
		.normalize('NFKD')
		.replaceAll(/[\u{300}-\u{36F}]/gu, '')
		.replaceAll(/[^a-z0-9]+/gu, '-')
		.replaceAll(/^-+|-+$/gu, '');
}
