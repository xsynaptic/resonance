import { toExcerpt } from '#lib/utils/text.ts';

// Terms carry no description field at all, hence the index signature
interface DescribableEntry {
	body?: string | undefined;
	data: { [key: string]: unknown; description?: string | undefined };
}

// Enough source to fill a 160-character excerpt once component tags and markdown come out
const sourceWordCount = 60;

export async function getEntryDescription(entry: DescribableEntry): Promise<string | undefined> {
	if (entry.data.description) return entry.data.description;

	const source = toDescriptionSource(entry.body ?? '');
	if (source === '') return undefined;

	return toExcerpt(source);
}

// Whole blocks only, so the clip never lands inside a link or an emphasis span
export function toDescriptionSource(body: string): string {
	const [aboveFold = ''] = body.split(/<More\s*\/>/, 1);
	const blocks = stripMdxComponents(aboveFold).split(/\n\s*\n/);
	const kept: Array<string> = [];
	let wordCount = 0;

	for (const block of blocks) {
		const text = block.trim();
		if (text === '') continue;
		kept.push(text);
		wordCount += text.split(/\s+/).length;
		if (wordCount >= sourceWordCount) break;
	}

	return kept.join('\n\n');
}

// A line opening with a component is an HTML block under CommonMark, its markdown left unparsed
function stripMdxComponents(markdown: string): string {
	return markdown.replaceAll(/<\/?[A-Z][\w.]*(?:\s[^>]*)?\/?>/g, '');
}
