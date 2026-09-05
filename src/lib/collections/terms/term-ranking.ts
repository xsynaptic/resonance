import type { ReferenceDataEntry } from 'astro:content';

import { getEntries } from 'astro:content';

import type { ResolvedRef } from '#lib/utils/terms.ts';

import { getStylesIndex } from '#lib/collections/terms/term-index.ts';
import { getContentUrl } from '#lib/utils/routing.ts';

// The header leads with frontmatter order; the coda leads with whichever styles carry the most content
export async function resolveStylesRanked(
	refs: Array<ReferenceDataEntry<'styles'>> | undefined,
): Promise<Array<ResolvedRef>> {
	if (!refs || refs.length === 0) return [];

	const [entries, index] = await Promise.all([getEntries(refs), getStylesIndex()]);

	function countOf(id: string) {
		return index.get(id)?.length ?? 0;
	}

	// A tie keeps frontmatter order; `sort` is stable
	return [...entries]
		.sort((first, second) => countOf(second.id) - countOf(first.id))
		.map((entry) => ({ label: entry.data.title, url: getContentUrl('styles', entry.id) }));
}
