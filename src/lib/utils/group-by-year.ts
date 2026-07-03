import type { ContentItem } from '#lib/catalog/catalog-data.ts';

export interface YearGroup {
	items: Array<ContentItem>;
	year: number;
}

// Collapse date-descending items into consecutive year runs; monotonic input means one run per year
export function groupByYear(items: Array<ContentItem>): Array<YearGroup> {
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
