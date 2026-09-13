import type { Pagination } from '#lib/utils/pagination-types.ts';
import type { YearGroup } from '#lib/utils/year-groups.ts';

import { getCatalog } from '#lib/catalog/catalog-data.ts';
import { t } from '#lib/i18n/i18n-strings.ts';
import { formatStringTemplate } from '#lib/utils/text.ts';
import { getYearGroups } from '#lib/utils/year-groups.ts';

let archiveYearsPromise: Promise<Array<YearGroup>> | undefined;

// Not an `IndexedCollection` in the shared routing module, so the archive names its own paths
export function getArchivePath(): string {
	return '/archive/';
}

export function getArchiveYearPagination(years: Array<string>, currentYear?: string) {
	const pagination: Pagination = {
		label: t('archive.yearsLabel'),
		options: years
			.toSorted((yearA, yearB) => yearB.localeCompare(yearA))
			.map((year) => ({
				isCurrent: year === currentYear,
				label: year,
				url: getArchiveYearPath(year),
			})),
		selectLabel: t('archive.selectLabel'),
		submitLabel: t('pagination.submit'),
	};

	const currentIndex = pagination.options.findIndex((option) => option.isCurrent);

	if (currentIndex === -1) {
		pagination.placeholder = t('archive.selectPlaceholder');
		return pagination;
	}

	const olderOption = pagination.options[currentIndex + 1];
	const newerOption = pagination.options[currentIndex - 1];

	if (olderOption) {
		pagination.previous = {
			ariaLabel: formatStringTemplate(t('archive.olderYear'), { year: olderOption.label }),
			label: olderOption.label,
			url: olderOption.url,
		};
	}

	if (newerOption) {
		pagination.next = {
			ariaLabel: formatStringTemplate(t('archive.newerYear'), { year: newerOption.label }),
			label: newerOption.label,
			url: newerOption.url,
		};
	}

	return pagination;
}

export function getArchiveYearPath(year: string): string {
	return `${getArchivePath()}${year}/`;
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
