import type { CreditValue, LabelCreditValue } from '#lib/schemas/credits.ts';
import type { LinkableEntry } from '#lib/utils/entries.ts';

import { toCreditArray } from '#lib/utils/terms.ts';
import { toSlug } from '#lib/utils/text.ts';
import { toFlatTracks } from '#lib/utils/track-groups.ts';

export interface ListedRow {
	artists?: Array<CreditValue> | CreditValue | undefined;
	labels?: Array<LabelCreditValue> | undefined;
	mixArtists?: Array<CreditValue> | CreditValue | undefined;
}

export function toCreditId(credit: CreditValue, slugs: Map<string, string>): string {
	if (typeof credit !== 'string') return credit.id;

	const slug = toSlug(credit);

	return slugs.get(slug) ?? slug;
}

export function toListedRows(entry: LinkableEntry): Array<ListedRow> {
	const { data } = entry;

	return [
		...toFlatTracks('tracks' in data ? data.tracks : undefined),
		...('selections' in data ? (data.selections ?? []) : []),
	];
}

export function toRowArtists(row: ListedRow): Array<CreditValue> {
	return [...toCreditArray(row.artists), ...toCreditArray(row.mixArtists)];
}
