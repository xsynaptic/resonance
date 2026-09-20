import type { CollectionEntry, ReferenceDataEntry } from 'astro:content';

import { getEntries } from 'astro:content';

import type { LinkedName } from '#lib/utils/terms.ts';

import { getStylesIndex } from '#lib/collections/terms/term-index.ts';
import { resolveCredits, resolveTermLinks, toLinkedName } from '#lib/utils/terms.ts';

export async function resolveEntryTerms(
	data: Pick<
		CollectionEntry<'mixes' | 'posts' | 'reviews'>['data'],
		'labels' | 'styles' | 'themes'
	>,
) {
	const [labelTerms, styleTerms, styleTermsRanked, themeTerms] = await Promise.all([
		resolveCredits('labels', data.labels),
		resolveTermLinks('styles', data.styles),
		resolveStylesRanked(data.styles),
		resolveTermLinks('themes', data.themes),
	]);

	return { labelTerms, styleTerms, styleTermsRanked, themeTerms };
}

// The header leads with frontmatter order; the coda leads with whichever styles carry the most content
async function resolveStylesRanked(
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
		.map((entry) => toLinkedName('styles', entry));
}
