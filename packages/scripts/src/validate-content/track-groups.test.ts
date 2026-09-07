import { describe, expect, test } from 'vitest';

import { validateTrackGroups } from '#validate-content/track-groups.ts';
import { makeEntry } from '#validate-content/validate-test-utils.ts';

function makeGroup(title: string, files: Array<string>, timestamps: Array<string | undefined>) {
	return {
		title,
		...(files.length > 0 ? { files } : {}),
		tracks: timestamps.map((timestamp, index) => ({
			title: `Track ${(index + 1).toString()}`,
			...(timestamp ? { timestamp } : {}),
		})),
	};
}

function makeMix(data: Record<string, unknown>) {
	return makeEntry({ data, filePath: 'collections/mixes/2011/a-mix.mdx', id: 'a-mix' });
}

describe('validateTrackGroups', () => {
	test('passes a flat tracklist, which names no files of its own', () => {
		const mixes = [
			makeMix({
				files: ['A Mix.mp3'],
				tracks: [{ timestamp: '00:00:00', title: 'Track 1' }],
			}),
		];

		expect(validateTrackGroups(mixes).status).toBe('pass');
	});

	test('passes two timestamped groups that each name a file from the mix', () => {
		const mixes = [
			makeMix({
				files: ['Part One.mp3', 'Part Two.mp3'],
				tracks: [
					makeGroup('Part One', ['Part One.mp3'], ['00:00:00']),
					makeGroup('Part Two', ['Part Two.mp3'], ['00:00:00']),
				],
			}),
		];

		expect(validateTrackGroups(mixes).status).toBe('pass');
	});

	test('passes one timestamped group alongside an untimed one that names nothing', () => {
		const mixes = [
			makeMix({
				files: ['A Mix.mp3'],
				tracks: [
					makeGroup('Disc One', [], ['00:00:00']),
					makeGroup('Disc Two', [], [undefined, undefined]),
				],
			}),
		];

		expect(validateTrackGroups(mixes).status).toBe('pass');
	});

	test('fails a group naming a file the mix does not carry', () => {
		const mixes = [
			makeMix({ files: ['A Mix.mp3'], tracks: [makeGroup('Disc One', ['Other.mp3'], [])] }),
		];

		expect(validateTrackGroups(mixes)).toEqual({
			issues: [
				{
					message:
						'collections/mixes/2011/a-mix.mdx: group "Disc One" names "Other.mp3", missing from `files`',
				},
				{
					message:
						'collections/mixes/2011/a-mix.mdx: "A Mix.mp3" is named by no group and drops off the page',
				},
			],
			status: 'fail',
			summary: 'Found 2 track group file problem(s)',
		});
	});

	test('fails two groups naming the same file', () => {
		const mixes = [
			makeMix({
				files: ['A Mix.mp3'],
				tracks: [
					makeGroup('Disc One', ['A Mix.mp3'], []),
					makeGroup('Disc Two', ['A Mix.mp3'], []),
				],
			}),
		];

		expect(validateTrackGroups(mixes)).toEqual({
			issues: [
				{
					message:
						'collections/mixes/2011/a-mix.mdx: groups "Disc One" and "Disc Two" both name "A Mix.mp3"',
				},
			],
			status: 'fail',
			summary: 'Found 1 track group file problem(s)',
		});
	});

	test('fails a mix file named by no group once another group names one', () => {
		const mixes = [
			makeMix({
				files: ['Part One.mp3', 'Part Two.mp3'],
				tracks: [makeGroup('Part One', ['Part One.mp3'], []), makeGroup('Part Two', [], [])],
			}),
		];

		expect(validateTrackGroups(mixes)).toEqual({
			issues: [
				{
					message:
						'collections/mixes/2011/a-mix.mdx: "Part Two.mp3" is named by no group and drops off the page',
				},
			],
			status: 'fail',
			summary: 'Found 1 track group file problem(s)',
		});
	});

	test('fails two timestamped groups that would write two sheets to one filename', () => {
		const mixes = [
			makeMix({
				files: ['A Mix.mp3'],
				tracks: [makeGroup('Disc One', [], ['00:00:00']), makeGroup('Disc Two', [], ['00:00:00'])],
			}),
		];

		expect(validateTrackGroups(mixes)).toEqual({
			issues: [
				{
					message:
						'collections/mixes/2011/a-mix.mdx: group "Disc One" carries timestamps alongside another and names no `files`',
				},
				{
					message:
						'collections/mixes/2011/a-mix.mdx: group "Disc Two" carries timestamps alongside another and names no `files`',
				},
			],
			status: 'fail',
			summary: 'Found 2 track group file problem(s)',
		});
	});
});
