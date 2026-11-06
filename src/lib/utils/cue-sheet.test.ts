import { fc, test } from '@fast-check/vitest';
import { parseTimestampSeconds } from '@xsynaptic/shared/schemas';
import { describe, expect } from 'vitest';

import { buildCueSheet } from '#lib/utils/cue-sheet.ts';

const twoDigits = (value: number) => String(value).padStart(2, '0');

const timestampInTheSchemaGrammar = fc
	.record({
		hours: fc.integer({ max: 99, min: 0 }),
		hundredths: fc.integer({ max: 99, min: 0 }),
		minutes: fc.integer({ max: 59, min: 0 }),
		seconds: fc.integer({ max: 59, min: 0 }),
	})
	.map(({ hours, hundredths, minutes, seconds }) => ({
		text: `${twoDigits(hours)}:${twoDigits(minutes)}:${twoDigits(seconds)}.${twoDigits(hundredths)}`,
		totalHundredths: ((hours * 60 + minutes) * 60 + seconds) * 100 + hundredths,
	}));

const lineBreakingPiece = fc.constantFrom(
	'\n',
	'\r',
	'\r\n',
	'\r\n  TRACK 99 AUDIO',
	'\t',
	'\u{2028}',
	'"',
);

const anyFieldText = fc
	.array(
		fc.oneof(
			{ arbitrary: fc.string({ unit: 'binary' }), weight: 3 },
			{ arbitrary: lineBreakingPiece, weight: 2 },
		),
		{ maxLength: 4 },
	)
	.map((pieces) => pieces.join(''));

const timestampText = timestampInTheSchemaGrammar.map((timestamp) => timestamp.text);

const cueSheetFields = fc.record({
	performer: anyFieldText,
	title: anyFieldText,
	tracks: fc.array(
		fc.record({
			performer: anyFieldText,
			timestamp: fc.option(timestampText, { nil: undefined }),
			title: anyFieldText,
		}),
		{ maxLength: 4 },
	),
});

function expectedLineCount({
	performer,
	title,
	tracks,
}: {
	performer: string;
	title: string;
	tracks: Array<{ performer: string; timestamp: string | undefined }>;
}): number {
	let count = 1 + (performer ? 1 : 0) + (title ? 1 : 0);

	for (const track of tracks) {
		if (track.timestamp !== undefined) count += track.performer ? 4 : 3;
	}

	return count;
}

function indexOf(timestamp: string): string | undefined {
	const sheet = buildCueSheet({
		fileName: 'mix.flac',
		tracks: [{ timestamp, title: 'Track' }],
	});

	return /INDEX 01 (.+)\r\n/.exec(sheet)?.[1];
}

describe('buildCueSheet', () => {
	test.prop([timestampInTheSchemaGrammar], { numRuns: 1000 })(
		'reads every INDEX back at most one frame before its timestamp, never after, with seconds under 60 and frames under 75',
		({ text, totalHundredths }) => {
			expect(parseTimestampSeconds(text)).toBeTypeOf('number');

			const [minutes = NaN, seconds = NaN, frames = NaN] = (indexOf(text) ?? '')
				.split(':')
				.map(Number);
			const indexFrames = (minutes * 60 + seconds) * 75 + frames;
			const fourTimesFramesShort = totalHundredths * 3 - indexFrames * 4;

			expect(seconds).toBeLessThan(60);
			expect(frames).toBeLessThan(75);
			expect(fourTimesFramesShort).toBeGreaterThanOrEqual(0);
			expect(fourTimesFramesShort).toBeLessThan(4);
		},
	);

	test.prop([cueSheetFields], { numRuns: 1000 })(
		'keeps one line per field and one TRACK per timed track, whatever the titles and performers hold',
		(fields) => {
			const lines = buildCueSheet({ ...fields, fileName: 'mix.flac' }).split('\r\n');
			const timedTracks = fields.tracks.filter((track) => track.timestamp !== undefined);

			expect(lines.pop()).toBe('');
			expect(lines.filter((line) => /[\r\n]/u.test(line))).toStrictEqual([]);
			expect(lines).toHaveLength(expectedLineCount(fields));
			expect(lines.filter((line) => line.startsWith('  TRACK '))).toHaveLength(timedTracks.length);
		},
	);

	test('emits a full header followed by track entries', () => {
		const sheet = buildCueSheet({
			date: '2021',
			fileName: 'DJ Basilisk - Uroboros 1.flac',
			performer: 'DJ Basilisk',
			title: 'Uroboros 1',
			tracks: [
				{ performer: 'Lorn', timestamp: '00:00:00.00', title: 'All Directions Are the Same' },
				{ performer: 'O Yuki Conjugate', timestamp: '00:03:54.46', title: 'Black Magic Box' },
			],
		});

		expect(sheet).toBe(
			[
				'PERFORMER "DJ Basilisk"',
				'TITLE "Uroboros 1"',
				'DATE 2021',
				'FILE "DJ Basilisk - Uroboros 1.flac" WAVE',
				'  TRACK 01 AUDIO',
				'    PERFORMER "Lorn"',
				'    TITLE "All Directions Are the Same"',
				'    INDEX 01 00:00:00',
				'  TRACK 02 AUDIO',
				'    PERFORMER "O Yuki Conjugate"',
				'    TITLE "Black Magic Box"',
				'    INDEX 01 03:54:34',
				'',
			].join('\r\n'),
		);
	});

	test.each([
		['00:03:54.46', '03:54:34'],
		['00:37:32.24', '37:32:18'],
		['00:57:15.50', '57:15:37'],
		['01:02:14.00', '62:14:00'],
	])('converts %s to %s', (timestamp, expected) => {
		expect(indexOf(timestamp)).toBe(expected);
	});

	test('emits three-digit track numbers rather than truncating', () => {
		const tracks = Array.from({ length: 132 }, (_, position) => ({
			timestamp: `00:${String(Math.floor(position / 60)).padStart(2, '0')}:${String(position % 60).padStart(2, '0')}.00`,
			title: `Track ${String(position + 1)}`,
		}));

		expect(buildCueSheet({ fileName: 'mix.flac', tracks })).toContain('  TRACK 132 AUDIO\r\n');
	});

	test('skips untimed tracks and renumbers the survivors contiguously', () => {
		const sheet = buildCueSheet({
			fileName: 'mix.flac',
			tracks: [
				{ timestamp: '00:00:00.00', title: 'First' },
				{ title: 'Layered, no start point' },
				{ timestamp: '00:05:00.00', title: 'Second' },
			],
		});

		expect(sheet).not.toContain('Layered');
		expect(sheet).toContain('  TRACK 02 AUDIO\r\n    TITLE "Second"');
	});

	test('drops double quotes, which the format cannot escape', () => {
		const sheet = buildCueSheet({
			fileName: 'mix.flac',
			performer: 'The "Band"',
			tracks: [{ performer: 'A "Name"', timestamp: '00:00:00.00', title: 'A "Title"' }],
		});

		expect(sheet).toContain('PERFORMER "The Band"');
		expect(sheet).toContain('    PERFORMER "A Name"');
		expect(sheet).toContain('    TITLE "A Title"');
	});

	test('collapses a line break in a title to one space', () => {
		const sheet = buildCueSheet({
			fileName: 'mix.flac',
			performer: '',
			title: '',
			tracks: [{ performer: '', timestamp: '00:00:00.00', title: '\n' }],
		});

		expect(sheet).toBe(
			[
				'FILE "mix.flac" WAVE',
				'  TRACK 01 AUDIO',
				'    TITLE " "',
				'    INDEX 01 00:00:00',
				'',
			].join('\r\n'),
		);
	});

	test('omits header lines whose source is absent', () => {
		const sheet = buildCueSheet({
			fileName: 'mix.flac',
			tracks: [{ timestamp: '00:00:00.00', title: 'Track' }],
		});

		expect(sheet.startsWith('FILE ')).toBe(true);
		expect(sheet).not.toContain('DATE');
		expect(sheet).not.toContain('PERFORMER');
	});

	test('declares MP3 for an mp3 file and WAVE for anything else', () => {
		const options = { tracks: [{ timestamp: '00:00:00.00', title: 'Track' }] };

		expect(buildCueSheet({ ...options, fileName: 'mix.mp3' })).toContain('FILE "mix.mp3" MP3');
		expect(buildCueSheet({ ...options, fileName: 'mix.flac' })).toContain('FILE "mix.flac" WAVE');
	});
});
