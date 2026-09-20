import type { CollectionEntry } from 'astro:content';

import { describe, expect, test } from 'vitest';

import type { TracklistValue } from '#lib/schemas/audio.ts';

import { setCollections } from '#lib/collections/astro-content-stub.ts';
import { getMixCuePoints, getMixCueSheets } from '#lib/collections/mixes/mixes-cue.ts';

setCollections({ artists: [{ data: { title: 'DJ Basilisk' }, id: 'dj-basilisk' }] });

const partOne = { artists: 'Lorn', timestamp: '00:00:00.00', title: 'All Directions Are the Same' };
const partTwo = { artists: 'O Yuki Conjugate', timestamp: '00:00:00.00', title: 'Black Magic Box' };

function fileLines(sheets: Array<{ text: string }>) {
	return sheets.map((sheet) => /FILE (.+) \w+\r\n/.exec(sheet.text)?.[1]);
}

// These functions read four fields off a mix; filling the rest of a CollectionEntry would say nothing
function makeMix(files: Array<string>, tracks: TracklistValue): CollectionEntry<'mixes'> {
	return {
		collection: 'mixes',
		data: { dateCreated: new Date('2021-06-01T00:00:00Z'), files, title: 'A Mix', tracks },
		id: 'a-mix',
	} as unknown as CollectionEntry<'mixes'>;
}

function titleLines(sheets: Array<{ text: string }>) {
	return sheets.map((sheet) => [...sheet.text.matchAll(/ {4}TITLE "(.+)"/g)].map(([, t]) => t));
}

describe('getMixCueSheets', () => {
	test('emits one sheet per file over the whole tracklist when it is flat', async () => {
		const sheets = await getMixCueSheets(makeMix(['A Mix.mp3', 'A Mix.flac'], [partOne, partTwo]));

		expect(sheets.map((sheet) => sheet.audioFile)).toEqual(['A Mix.mp3', 'A Mix.flac']);
		expect(titleLines(sheets)).toEqual([
			['All Directions Are the Same', 'Black Magic Box'],
			['All Directions Are the Same', 'Black Magic Box'],
		]);
	});

	test('lets a group naming no files inherit the mix files, matching the flat output', async () => {
		const files = ['A Mix.mp3', 'A Mix.flac'];
		const grouped = await getMixCueSheets(
			makeMix(files, [{ title: 'Disc One', tracks: [partOne, partTwo] }]),
		);
		const flat = await getMixCueSheets(makeMix(files, [partOne, partTwo]));

		expect(grouped).toEqual(flat);
	});

	test('gives a group naming files its own sheet over its own tracks', async () => {
		const sheets = await getMixCueSheets(
			makeMix(
				['Part One.mp3', 'Part Two.mp3'],
				[
					{ files: ['Part One.mp3'], title: 'Part One', tracks: [partOne] },
					{ files: ['Part Two.mp3'], title: 'Part Two', tracks: [partTwo] },
				],
			),
		);

		expect(fileLines(sheets)).toEqual(['"Part One.mp3"', '"Part Two.mp3"']);
		expect(titleLines(sheets)).toEqual([['All Directions Are the Same'], ['Black Magic Box']]);
	});

	test('emits nothing for a group with no timestamps, so the inline cue button matches the route', async () => {
		const sheets = await getMixCueSheets(
			makeMix(
				['Part One.mp3', 'Part Two.mp3'],
				[
					{ files: ['Part One.mp3'], title: 'Part One', tracks: [partOne] },
					{
						files: ['Part Two.mp3'],
						title: 'Part Two',
						tracks: [{ artists: 'O Yuki Conjugate', title: 'Untimed' }],
					},
				],
			),
		);

		expect(fileLines(sheets)).toEqual(['"Part One.mp3"']);
	});

	test('emits nothing when the mix carries no files for a group to inherit', async () => {
		await expect(getMixCueSheets(makeMix([], [partOne, partTwo]))).resolves.toEqual([]);
	});
});

describe('getMixCuePoints', () => {
	test('reads every group when none names files', async () => {
		const points = await getMixCuePoints(
			makeMix(
				['A Mix.mp3'],
				[
					{ title: 'Disc One', tracks: [partOne] },
					{ title: 'Disc Two', tracks: [partTwo] },
				],
			),
		);

		expect(points.map((point) => point.title)).toEqual([
			'All Directions Are the Same',
			'Black Magic Box',
		]);
	});

	test('reads only the first group when groups name files, which the player streams', async () => {
		const points = await getMixCuePoints(
			makeMix(
				['Part One.mp3', 'Part Two.mp3'],
				[
					{ files: ['Part One.mp3'], title: 'Part One', tracks: [partOne] },
					{ files: ['Part Two.mp3'], title: 'Part Two', tracks: [partTwo] },
				],
			),
		);

		expect(points.map((point) => point.title)).toEqual(['All Directions Are the Same']);
	});
});
