import { describe, expect, test } from 'vitest';

import { collectTimestampIssues } from '#validate-content/track-timestamps.ts';
import { makeEntry } from '#validate-content/validate-test-utils.ts';

function makeGroupedMix(groups: Array<Array<string | undefined>>) {
	return makeEntry({
		data: {
			tracks: groups.map((timestamps, index) => ({
				title: `Disc ${(index + 1).toString()}`,
				tracks: makeTracks(timestamps),
			})),
		},
		id: 'a-mix',
	});
}

function makeMix(timestamps: Array<string | undefined>, filePath?: string) {
	return makeEntry({
		id: 'a-mix',
		...(filePath ? { filePath } : {}),
		data: { tracks: makeTracks(timestamps) },
	});
}

function makeTracks(timestamps: Array<string | undefined>) {
	return timestamps.map((timestamp, index) => ({
		title: `Track ${(index + 1).toString()}`,
		...(timestamp ? { timestamp } : {}),
	}));
}

describe('collectTimestampIssues', () => {
	test('accepts timestamps that run forwards', () => {
		expect(collectTimestampIssues([makeMix(['00:00:00', '00:07:51', '01:14:02'])])).toEqual([]);
	});

	test('accepts two tracks sharing a cue point', () => {
		expect(collectTimestampIssues([makeMix(['00:07:51', '00:07:51'])])).toEqual([]);
	});

	test('flags a second tracklist restarting at zero, which is the merge failure', () => {
		const issues = collectTimestampIssues([
			makeMix(['00:00:00', '00:41:12', '00:00:00'], 'collections/mixes/2011/a-mix.mdx'),
		]);

		expect(issues).toEqual([
			{
				detail: 'Track 3 "Track 3" at 00:00:00 follows track 2 at 00:41:12',
				location: 'collections/mixes/2011/a-mix.mdx',
			},
		]);
	});

	test('compares against the previous timed track, skipping untimed ones between', () => {
		expect(collectTimestampIssues([makeMix(['00:41:12', undefined, '00:07:51'])])).toEqual([
			{ detail: 'Track 3 "Track 3" at 00:07:51 follows track 1 at 00:41:12', location: 'a-mix' },
		]);
	});

	test('accepts a second group restarting at zero, which is its own file', () => {
		expect(
			collectTimestampIssues([makeGroupedMix([['00:00:00', '00:41:12'], ['00:00:00']])]),
		).toEqual([]);
	});

	test('flags an out-of-order pair inside a group, numbered from that group', () => {
		expect(
			collectTimestampIssues([
				makeGroupedMix([['00:41:12'], ['00:00:00', '00:41:12', '00:07:51']]),
			]),
		).toEqual([
			{ detail: 'Track 3 "Track 3" at 00:07:51 follows track 2 at 00:41:12', location: 'a-mix' },
		]);
	});

	test('compares fractional seconds rather than string order', () => {
		expect(collectTimestampIssues([makeMix(['00:07:51.5', '00:07:51.25'])])).toEqual([
			{
				detail: 'Track 2 "Track 2" at 00:07:51.25 follows track 1 at 00:07:51.5',
				location: 'a-mix',
			},
		]);
	});
});
