import type { Page } from 'astro';

import type { Pagination } from '#lib/utils/pagination-types.ts';

import { t } from '#lib/i18n/i18n-strings.ts';
import { getPathWithTrailingSlash } from '#lib/utils/routing.ts';
import { formatStringTemplate } from '#lib/utils/text.ts';

// Astro appends the trailing slash only under `trailingSlash: 'always'`, and this site runs the default `'ignore'`
export function getPagination(page: Page) {
	const { currentPage, lastPage, url } = page;

	const basePath = url.first ?? url.current;

	const pagination: Pagination = {
		counter: formatStringTemplate(t('pagination.counter'), {
			current: currentPage,
			total: lastPage,
		}),
		label: t('pagination.label'),
		options: Array.from({ length: lastPage }, (_, index) => {
			const pageNumber = index + 1;

			return {
				isCurrent: pageNumber === currentPage,
				label: formatStringTemplate(t('pagination.pageNumber'), { page: pageNumber }),
				url:
					pageNumber === 1
						? getPathWithTrailingSlash(basePath)
						: getPathWithTrailingSlash(basePath, String(pageNumber)),
			};
		}),
		selectLabel: t('pagination.selectLabel'),
		selectSuffix: formatStringTemplate(t('pagination.selectTotal'), { total: lastPage }),
		submitLabel: t('pagination.submit'),
	};

	if (url.prev) {
		pagination.previous = {
			ariaLabel: t('pagination.previousPage'),
			label: t('pagination.previous'),
			url: getPathWithTrailingSlash(url.prev),
		};
	}

	if (url.next) {
		pagination.next = {
			ariaLabel: t('pagination.nextPage'),
			label: t('pagination.next'),
			url: getPathWithTrailingSlash(url.next),
		};
	}

	return pagination;
}
