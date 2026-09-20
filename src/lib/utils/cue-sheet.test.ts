import { describe, expect, test } from 'vitest';

import { buildCueSheet } from '#lib/utils/cue-sheet.ts';

function indexOf(timestamp: string): string | undefined {
	const sheet = buildCueSheet({
		fileName: 'mix.flac',
		tracks: [{ timestamp, title: 'Track' }],
	});

	return /INDEX 01 (.+)\r\n/.exec(sheet)?.[1];
}

describe('buildCueSheet', () => {
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
