import type { ContentCatalogItem } from '#lib/catalog/catalog-types.ts';

export interface YearGroup {
	items: Array<ContentCatalogItem>;
	year: number;
}

// Collapse date-descending items into consecutive year runs; monotonic input means one run per year
export function getYearGroups(items: Array<ContentCatalogItem>): Array<YearGroup> {
	const groups: Array<YearGroup> = [];
	for (const item of items) {
		const year = item.date.getFullYear();
		const current = groups.at(-1);
		if (current?.year === year) {
			current.items.push(item);
			continue;
		}
		groups.push({ items: [item], year });
	}
	return groups;
}
