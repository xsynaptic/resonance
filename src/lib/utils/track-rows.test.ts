import { describe, expect, test } from 'vitest';

import { setCollections } from '#lib/collections/astro-content-stub.ts';
import { buildTrackGroupRows, toFeedLine } from '#lib/utils/track-rows.ts';

setCollections({
	artists: [
		{ data: { title: 'Ott' }, id: 'ott' },
		{ data: { title: 'Ken Zo' }, id: 'ken-zo' },
	],
	labels: [{ data: { title: 'Twisted Records' }, id: 'twisted-records' }],
});

function rowOf(overrides: Partial<Parameters<typeof toFeedLine>[0]>) {
	return {
		artists: [],
		hasMeta: false,
		labels: [],
		metaSeparator: '',
		position: '01',
		remixCredit: [],
		time: undefined,
		title: 'A Track',
		year: undefined,
		...overrides,
	};
}

describe('toFeedLine', () => {
	test('drops the position for an ordinal, which the list numbers itself', () => {
		expect(toFeedLine(rowOf({ position: '01' }))).toBe('A Track');
	});

	test('keeps a vinyl position, which no ordered list can express', () => {
		expect(toFeedLine(rowOf({ position: 'A1' }))).toBe('A1. A Track');
	});

	test('joins several artists with a slash, matching the styled markup', () => {
		expect(toFeedLine(rowOf({ artists: [{ name: 'Ott' }, { name: 'Hallucinogen' }] }))).toBe(
			'Ott / Hallucinogen - A Track',
		);
	});

	test('spells out the remix credit the styled markup puts in a span', () => {
		expect(toFeedLine(rowOf({ remixCredit: [{ name: 'Ken Zo' }] }))).toBe('A Track (Ken Zo remix)');
	});

	test('joins label and year through the separator the row carries', () => {
		expect(
			toFeedLine(
				rowOf({
					hasMeta: true,
					labels: [{ name: 'Twisted Records' }],
					metaSeparator: ', ',
					year: '1999',
				}),
			),
		).toBe('A Track (Twisted Records, 1999)');
	});

	test('omits the separator when only one half of the meta is present', () => {
		expect(toFeedLine(rowOf({ hasMeta: true, year: '1999' }))).toBe('A Track (1999)');
	});

	test('brackets the duration last', () => {
		expect(toFeedLine(rowOf({ time: '06:12' }))).toBe('A Track [06:12]');
	});
});

describe('buildTrackGroupRows', () => {
	test('pads a single-digit ordinal and leaves a vinyl position alone', async () => {
		const group = await buildTrackGroupRows(
			{ tracks: [{ title: 'First' }, { position: 'A1', title: 'Second' }] },
			undefined,
		);

		expect(group.rows.map((row) => row.position)).toEqual(['01', 'A1']);
	});

	test('suppresses a remix credit the title already spells out', async () => {
		const group = await buildTrackGroupRows(
			{
				tracks: [
					{ mixArtists: [{ id: 'ken-zo' }], title: 'The 5th World (Ken Zo Remix)' },
					{ mixArtists: [{ id: 'ken-zo' }], title: 'The 5th World' },
				],
			},
			undefined,
		);

		expect(group.rows.map((row) => row.remixCredit)).toEqual([
			[],
			[{ name: 'Ken Zo', url: '/artists/ken-zo/' }],
		]);
	});

	test('offers a cue slug only where a group has both timestamps and files', async () => {
		const timed = await buildTrackGroupRows(
			{ files: ['a-mix.flac'], tracks: [{ timestamp: '00:00:00', title: 'First' }] },
			'a-mix',
		);
		const untimed = await buildTrackGroupRows(
			{ files: ['a-mix.flac'], tracks: [{ title: 'First' }] },
			'a-mix',
		);

		expect([timed.cueSlug, untimed.cueSlug]).toEqual(['a-mix', undefined]);
	});

	test('reports hasMeta for the group when any one row carries meta', async () => {
		const group = await buildTrackGroupRows(
			{ tracks: [{ title: 'First' }, { title: 'Second', year: '1999' }] },
			undefined,
		);

		expect([group.hasMeta, ...group.rows.map((row) => row.hasMeta)]).toEqual([true, false, true]);
	});
});
