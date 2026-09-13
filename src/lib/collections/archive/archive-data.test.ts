import { describe, expect, test } from 'vitest';

import { getArchiveYearPagination } from '#lib/collections/archive/archive-data.ts';

describe('getArchiveYearPagination', () => {
	const years = ['2013', '2011', '2009'];

	test('without a current year nothing is current, nothing links outward, and the select shows a placeholder', () => {
		const pagination = getArchiveYearPagination(years);

		expect(pagination.options.map((option) => option.url)).toStrictEqual([
			'/archive/2013/',
			'/archive/2011/',
			'/archive/2009/',
		]);
		expect(pagination.options.some((option) => option.isCurrent)).toBe(false);
		expect(pagination.previous).toBeUndefined();
		expect(pagination.next).toBeUndefined();
		expect(pagination.placeholder).toBe('Year');
	});

	test('the oldest year has no previous and points next to the newer year', () => {
		const pagination = getArchiveYearPagination(years, '2009');

		expect(pagination.previous).toBeUndefined();
		expect(pagination.next).toStrictEqual({
			ariaLabel: 'Newer: 2011',
			label: '2011',
			url: '/archive/2011/',
		});
		expect(pagination.placeholder).toBeUndefined();
	});

	test('years given oldest first still sort newest first and keep the older year as previous', () => {
		const pagination = getArchiveYearPagination(years.toReversed(), '2011');

		expect(pagination.options.map((option) => option.label)).toStrictEqual([
			'2013',
			'2011',
			'2009',
		]);
		expect(pagination.previous?.url).toBe('/archive/2009/');
		expect(pagination.next?.url).toBe('/archive/2013/');
	});

	test('the newest year has no next and points previous to the older year', () => {
		const pagination = getArchiveYearPagination(years, '2013');

		expect(pagination.next).toBeUndefined();
		expect(pagination.previous).toStrictEqual({
			ariaLabel: 'Older: 2011',
			label: '2011',
			url: '/archive/2011/',
		});
	});
});
