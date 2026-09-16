import { getCollection } from 'astro:content';

import type { ContentCatalogItem } from '#lib/catalog/catalog-types.ts';
import type { TermIndex } from '#lib/collections/terms/term-index.ts';
import type { ListedRow } from '#lib/utils/listed-rows.ts';

import {
	getArtistsIndex,
	getLabelsIndex,
	getMembers,
	rollUp,
	sortIndex,
} from '#lib/collections/terms/term-index.ts';
import { toCreditId, toListedRows, toRowArtists } from '#lib/utils/listed-rows.ts';
import { getSlugs } from '#lib/utils/terms.ts';

type AppearanceVocabulary = 'artists' | 'labels';

interface CreditLookup {
	slugs: Map<string, string>;
	termIds: Set<string>;
	vocabulary: AppearanceVocabulary;
}

let artistsPromise: Promise<TermIndex> | undefined;
let labelsPromise: Promise<TermIndex> | undefined;

export function getArtistAppearancesIndex(): Promise<TermIndex> {
	if (!artistsPromise) artistsPromise = buildAppearancesIndex('artists', getArtistsIndex);

	return artistsPromise;
}

export function getLabelAppearancesIndex(): Promise<TermIndex> {
	if (!labelsPromise) labelsPromise = buildAppearancesIndex('labels', getLabelsIndex);

	return labelsPromise;
}

async function buildAppearancesIndex(
	vocabulary: AppearanceVocabulary,
	getAuthoredIndex: () => Promise<TermIndex>,
): Promise<TermIndex> {
	const [members, slugs, termIds, authored] = await Promise.all([
		getMembers(),
		getSlugs(vocabulary),
		getTermIds(vocabulary),
		getAuthoredIndex(),
	]);

	const lookup: CreditLookup = { slugs, termIds, vocabulary };
	const byTerm = new Map<string, Map<string, ContentCatalogItem>>();

	for (const { entry, item } of members) {
		for (const row of toListedRows(entry)) {
			for (const termId of toRowTermIds(row, lookup)) {
				const items = byTerm.get(termId) ?? new Map<string, ContentCatalogItem>();

				// Keyed by id, so a Term credited on several Tracks of one Entry lists it once
				items.set(item.id, item);
				byTerm.set(termId, items);
			}
		}
	}

	const index: TermIndex = new Map(
		[...byTerm].map(([termId, items]) => [termId, [...items.values()]] as const),
	);

	// Subtraction runs last so a parent Label sheds the Entries its descendants rolled up to it
	const rolled = vocabulary === 'labels' ? await rollUp('labels')(index) : sortIndex(index);

	return subtractAuthored(rolled, authored);
}

async function getTermIds(vocabulary: AppearanceVocabulary): Promise<Set<string>> {
	const entries = await getCollection(vocabulary);

	return new Set(entries.map((entry) => entry.id));
}

// An Entry is never also an Appearance of the same Term
function subtractAuthored(index: TermIndex, authored: TermIndex): TermIndex {
	const subtracted: TermIndex = new Map();

	for (const [termId, items] of index) {
		const authoredIds = new Set((authored.get(termId) ?? []).map((item) => item.id));
		const kept = items.filter((item) => !authoredIds.has(item.id));

		if (kept.length > 0) subtracted.set(termId, kept);
	}

	return subtracted;
}

// Free text resolves to its own slug when nothing is cataloged under it, which names no Term
function toRowTermIds(row: ListedRow, lookup: CreditLookup): Array<string> {
	const credits = lookup.vocabulary === 'artists' ? toRowArtists(row) : (row.labels ?? []);

	return credits
		.map((credit) => toCreditId(credit, lookup.slugs))
		.filter((id) => lookup.termIds.has(id));
}
