import type { CollectionEntry } from 'astro:content';

import { fc, test } from '@fast-check/vitest';
import { describe, expect } from 'vitest';

import type { TracklistValue } from '#lib/schemas/audio.ts';

import { setCollections } from '#lib/collections/astro-content-stub.ts';
import { getMixCuePoints, getMixCueSheets } from '#lib/collections/mixes/mixes-cue.ts';

setCollections({ artists: [{ data: { title: 'DJ Basilisk' }, id: 'dj-basilisk' }] });

const partOne = { artists: 'Lorn', timestamp: '00:00:00.00', title: 'All Directions Are the Same' };
const partTwo = { artists: 'O Yuki Conjugate', timestamp: '00:04:10.00', title: 'Black Magic Box' };

function fileLines(sheets: Array<{ text: string }>) {
	return sheets.map((sheet) => /FILE (.+) \w+\r\n/.exec(sheet.text)?.[1]);
}

// These functions read four fields off a mix; filling the rest of a CollectionEntry would say nothing
function makeMix(files: Array<string>, tracks: TracklistValue): CollectionEntry<'mixes'> {
	return {
		collection: 'mixes',
		data: {
			alias: { collection: 'artists', id: 'dj-basilisk' },
			dateCreated: new Date('2021-06-01T00:00:00Z'),
			files,
			title: 'A Mix',
			tracks,
		},
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

	test('heads the sheet with the alias, the title and the year, and credits each track', async () => {
		const [sheet] = await getMixCueSheets(makeMix(['A Mix.mp3'], [partOne, partTwo]));

		expect(sheet?.text).toBe(
			[
				'PERFORMER "DJ Basilisk"',
				'TITLE "A Mix"',
				'DATE 2021',
				'FILE "A Mix.mp3" MP3',
				'  TRACK 01 AUDIO',
				'    PERFORMER "Lorn"',
				'    TITLE "All Directions Are the Same"',
				'    INDEX 01 00:00:00',
				'  TRACK 02 AUDIO',
				'    PERFORMER "O Yuki Conjugate"',
				'    TITLE "Black Magic Box"',
				'    INDEX 01 04:10:00',
				'',
			].join('\r\n'),
		);
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

describe('getMixCueSheets over any grouping', () => {
	const audioFiles = ['Mix.mp3', 'Mix.flac'];
	const group = fc.record({
		files: fc.option(fc.subarray(audioFiles), { nil: undefined }),
		isTimed: fc.boolean(),
	});

	test.prop([fc.subarray(audioFiles), fc.array(group, { maxLength: 3, minLength: 1 })])(
		'emits one sheet per file, carrying every timed track of each group that plays from it',
		async (mixFiles, groups) => {
			const tracklist = groups.map(({ files, isTimed }, index) => ({
				...(files === undefined ? {} : { files }),
				title: `Part ${String(index)}`,
				tracks: [
					{
						artists: 'Lorn',
						title: `Track ${String(index)}`,
						...(isTimed ? { timestamp: '00:00:00.00' } : {}),
					},
				],
			}));
			const sheets = await getMixCueSheets(makeMix(mixFiles, tracklist));
			const sheetFiles = sheets.map((sheet) => sheet.audioFile);
			const claimed = new Set(groups.flatMap(({ files }) => files ?? []));

			expect(new Set(sheetFiles).size).toBe(sheetFiles.length);

			const unclaimed = mixFiles.filter((mixFile) => !claimed.has(mixFile));
			const playsFrom = (index: number) => groups[index]?.files ?? unclaimed;

			for (const [index, { isTimed }] of groups.entries()) {
				if (!isTimed) continue;

				for (const file of playsFrom(index)) {
					const sheet = sheets.find((candidate) => candidate.audioFile === file);

					expect(sheet?.text).toContain(`TITLE "Track ${String(index)}"`);
				}
			}

			for (const { audioFile, text } of sheets) {
				for (const [, index] of text.matchAll(/TITLE "Track (\d+)"/g)) {
					expect(playsFrom(Number(index))).toContain(audioFile);
				}
			}
		},
	);
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

		expect(points).toEqual([
			{ artistLine: 'Lorn', startSeconds: 0, title: 'All Directions Are the Same' },
			{ artistLine: 'O Yuki Conjugate', startSeconds: 250, title: 'Black Magic Box' },
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
