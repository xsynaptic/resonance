import type { YearGroup } from '#lib/utils/year-groups.ts';

import { getCatalog } from '#lib/catalog/catalog-data.ts';
import { getYearGroups } from '#lib/utils/year-groups.ts';

let archiveYearsPromise: Promise<Array<YearGroup>> | undefined;

// Not an `IndexedCollection` in the shared routing module, so the archive names its own paths
export function getArchivePath(): string {
	return '/archive/';
}

export function getArchiveYearPath(year: number): string {
	return `${getArchivePath()}${String(year)}/`;
}

// Every year with editorial content, newest first; pages are outside the stream and carry no date worth filing
export function getArchiveYears(): Promise<Array<YearGroup>> {
	if (!archiveYearsPromise) archiveYearsPromise = buildArchiveYears();

	return archiveYearsPromise;
}

async function buildArchiveYears(): Promise<Array<YearGroup>> {
	const catalog = await getCatalog();

	return getYearGroups(catalog.byCollection('mixes', 'posts', 'reviews'));
}
