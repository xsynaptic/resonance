import type { ReferenceDataEntry } from 'astro:content';

import { getContentPath } from '@xsynaptic/shared/routing';
import { getEntries } from 'astro:content';

import type { LinkedName } from '#lib/utils/terms.ts';

import { getStylesIndex } from '#lib/collections/terms/term-index.ts';

// The header leads with frontmatter order; the coda leads with whichever styles carry the most content
export async function resolveStylesRanked(
	references: Array<ReferenceDataEntry<'styles'>> | undefined,
): Promise<Array<LinkedName>> {
	if (!references || references.length === 0) return [];

	const [entries, index] = await Promise.all([getEntries(references), getStylesIndex()]);

	function countOf(id: string) {
		return index.get(id)?.length ?? 0;
	}

	// A tie keeps frontmatter order; `sort` is stable
	return [...entries]
		.sort((first, second) => countOf(second.id) - countOf(first.id))
		.map((entry) => ({ name: entry.data.title, url: getContentPath('styles', entry.id) }));
}
