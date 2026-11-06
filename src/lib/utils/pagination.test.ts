import type { Page } from 'astro';

import { describe, expect, test } from 'vitest';

import { getPagination } from '#lib/utils/pagination.ts';

function getUrl(pageNumber: number, trailingSlash: string) {
	return pageNumber === 1
		? `/posts${trailingSlash}`
		: `/posts/${String(pageNumber)}${trailingSlash}`;
}

function makePage(currentPage: number, lastPage: number, trailingSlash: string): Page {
	return {
		currentPage,
		data: [],
		end: 9,
		lastPage,
		size: 10,
		start: 0,
		total: lastPage * 10,
		url: {
			current: getUrl(currentPage, trailingSlash),
			first: currentPage === 1 ? undefined : getUrl(1, trailingSlash),
			last: currentPage === lastPage ? undefined : getUrl(lastPage, trailingSlash),
			next: currentPage === lastPage ? undefined : getUrl(currentPage + 1, trailingSlash),
			prev: currentPage === 1 ? undefined : getUrl(currentPage - 1, trailingSlash),
		},
	};
}

describe.each([
	{ shape: 'bare', trailingSlash: '' },
	{ shape: 'slashed', trailingSlash: '/' },
])('getPagination with $shape urls', ({ trailingSlash }) => {
	test('page 1 normalizes every option to the trailing-slash form', () => {
		const pagination = getPagination(makePage(1, 3, trailingSlash));

		expect(pagination.options.at(0)?.url).toBe('/posts/');
		expect(pagination.options.at(2)?.url).toBe('/posts/3/');
		expect(pagination.previous).toBeUndefined();
		expect(pagination.next?.url).toBe('/posts/2/');
	});

	test('a middle page marks only itself current and links back to the unnumbered first page', () => {
		const pagination = getPagination(makePage(2, 3, trailingSlash));

		expect(
			pagination.options.filter((option) => option.isCurrent).map((option) => option.url),
		).toStrictEqual(['/posts/2/']);
		expect(pagination.previous?.url).toBe('/posts/');
	});

	test('marks one option current, keeps every url distinct and agrees with previous and next, for every page of up to 12', () => {
		let checked = 0;

		for (let lastPage = 1; lastPage <= 12; lastPage += 1) {
			for (let currentPage = 1; currentPage <= lastPage; currentPage += 1) {
				const { next, options, previous } = getPagination(
					makePage(currentPage, lastPage, trailingSlash),
				);
				const urls = options.map((option) => option.url);
				const at = JSON.stringify({ currentPage, lastPage });

				expect(options, at).toHaveLength(lastPage);
				expect(
					options.flatMap((option, index) => (option.isCurrent ? [index + 1] : [])),
					at,
				).toStrictEqual([currentPage]);
				expect(new Set(urls).size, at).toBe(lastPage);
				expect(previous?.url, at).toBe(currentPage === 1 ? undefined : urls[currentPage - 2]);
				expect(next?.url, at).toBe(currentPage === lastPage ? undefined : urls[currentPage]);

				checked += 1;
			}
		}

		expect(checked).toBe(78);
	});
});
