import { describe, expect, test } from 'vitest';

import { collectCreditIssues } from '#validate-content/credits.ts';
import { makeEntry } from '#validate-content/validate-test-utils.ts';

const catalog = [
	makeEntry({ collection: 'artists', id: 'shpongle' }),
	makeEntry({ collection: 'artists', id: 'simon-posford' }),
	makeEntry({ collection: 'labels', id: 'twisted' }),
];

describe('collectCreditIssues', () => {
	test('ignores free text, which is the whole point of the polymorphic credit', () => {
		const entries = [makeEntry({ data: { artists: ['Some Unknown Act'] }, id: 'a-review' })];

		expect(collectCreditIssues(entries, catalog)).toEqual([]);
	});

	test('accepts an object credit whose id resolves', () => {
		const entries = [
			makeEntry({
				data: { artists: [{ id: 'shpongle' }], labels: [{ id: 'twisted' }] },
				id: 'a-review',
			}),
		];

		expect(collectCreditIssues(entries, catalog)).toEqual([]);
	});

	test('flags an object credit whose id resolves to nothing', () => {
		const entries = [
			makeEntry({
				data: { artists: [{ id: 'shpongle' }, { id: 'nobody' }] },
				filePath: 'collections/reviews/2003/a-review.mdx',
				id: 'a-review',
			}),
		];

		expect(collectCreditIssues(entries, catalog)).toEqual([
			{
				collection: 'artists',
				field: 'artists',
				id: 'nobody',
				location: 'collections/reviews/2003/a-review.mdx',
			},
		]);
	});

	test('checks an artist entry from both ends of the relation', () => {
		const entries = [
			makeEntry({
				data: { members: [{ id: 'simon-posford' }], projects: [{ id: 'nobody' }] },
				id: 'shpongle',
			}),
		];

		expect(collectCreditIssues(entries, catalog)).toEqual([
			{ collection: 'artists', field: 'projects', id: 'nobody', location: 'shpongle' },
		]);
	});

	test('reaches into a track, reporting which one', () => {
		const entries = [
			makeEntry({
				data: {
					tracks: [
						{ artists: ['Extrawelt'], title: 'Yummy Unbroken' },
						{ labels: [{ id: 'nowhere' }], mixArtists: [{ id: 'nobody' }], title: 'Second' },
					],
				},
				id: 'a-mix',
			}),
		];

		expect(collectCreditIssues(entries, catalog)).toEqual([
			{ collection: 'labels', field: 'tracks[1].labels', id: 'nowhere', location: 'a-mix' },
			{ collection: 'artists', field: 'tracks[1].mixArtists', id: 'nobody', location: 'a-mix' },
		]);
	});

	test('reaches through a track group, naming the group and the track', () => {
		const entries = [
			makeEntry({
				data: {
					tracks: [
						{ title: 'Disc One', tracks: [{ artists: ['Extrawelt'], title: 'Yummy Unbroken' }] },
						{
							title: 'Disc Two',
							tracks: [
								{ artists: ['Extrawelt'], title: 'First' },
								{ labels: [{ id: 'nowhere' }], title: 'Second' },
							],
						},
					],
				},
				id: 'a-mix',
			}),
		];

		expect(collectCreditIssues(entries, catalog)).toEqual([
			{
				collection: 'labels',
				field: 'tracks[1].tracks[1].labels',
				id: 'nowhere',
				location: 'a-mix',
			},
		]);
	});

	test('reaches into a list item', () => {
		const entries = [
			makeEntry({
				data: { selections: [{ labels: [{ id: 'nowhere' }], title: 'X' }] },
				id: 'a-post',
			}),
		];

		expect(collectCreditIssues(entries, catalog)).toEqual([
			{ collection: 'labels', field: 'selections[0].labels', id: 'nowhere', location: 'a-post' },
		]);
	});

	test('flags a scalar credit that resolves to nothing', () => {
		const entries = [
			makeEntry({ data: { tracks: [{ artists: { id: 'nobody' }, title: 'X' }] }, id: 'a-mix' }),
		];

		expect(collectCreditIssues(entries, catalog)).toEqual([
			{ collection: 'artists', field: 'tracks[0].artists', id: 'nobody', location: 'a-mix' },
		]);
	});
});
