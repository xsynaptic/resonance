import { describe, expect, test } from 'vitest';

import type { DiscogsArtistCredit, DiscogsRelease, DiscogsTrack } from '#discogs/discogs-api.ts';

import { toArtistName, toEntry, toSource, toTracklist } from '#discogs/discogs-tracklists.ts';

function credit(name: string, overrides: Partial<DiscogsArtistCredit> = {}): DiscogsArtistCredit {
	return { join: '', name, ...overrides };
}

function entrySource(...frontmatter: Array<string>): string {
	return ['---', 'title: A Review', ...frontmatter, '---', '', 'The body.', ''].join('\n');
}

function release(overrides: Partial<DiscogsRelease> = {}): DiscogsRelease {
	return { artists: [credit('Koxbox')], id: 1, tracklist: [], ...overrides };
}

function track(overrides: Partial<DiscogsTrack> = {}): DiscogsTrack {
	return { duration: '', position: '', title: 'A Track', type_: 'track', ...overrides };
}

describe('toArtistName', () => {
	test('strips the trailing disambiguation counter', () => {
		expect(toArtistName([credit('Voodoo People (2)')])).toBe('Voodoo People');
		expect(toArtistName([credit('Blink-182')])).toBe('Blink-182');
	});

	test('writes join words the way the hand-written Mixes write them', () => {
		const featuring = [credit('Rainbow Spirit', { join: 'Featuring' }), credit('DJ Sangeet')];
		const slash = [credit('Plaid', { join: '/' }), credit('Mind Over Rhythm')];
		const ampersand = [credit('Chaim', { join: '&' }), credit('Kiki')];

		expect(toArtistName(featuring)).toBe('Rainbow Spirit feat. DJ Sangeet');
		expect(toArtistName(slash)).toBe('Plaid & Mind Over Rhythm');
		expect(toArtistName(ampersand)).toBe('Chaim & Kiki');
	});

	test('takes no space before a comma, and treats an empty join as one', () => {
		const listed = [
			credit('Emerson', { join: ',' }),
			credit('Digweed', { join: '&' }),
			credit('Muir'),
		];

		expect(toArtistName(listed)).toBe('Emerson, Digweed & Muir');
		expect(toArtistName([credit('First'), credit('Second')])).toBe('First, Second');
	});
});

describe('toTracklist', () => {
	test('drops a `heading`, which is a vinyl side label rather than a track', () => {
		const problems: Array<string> = [];
		const tracklist = toTracklist(
			release({
				tracklist: [
					track({ position: '', title: 'This Side', type_: 'heading' }),
					track({ duration: '6:51', position: 'A1', title: 'Crystal' }),
				],
			}),
			'a-review.mdx',
			problems,
		);

		expect(tracklist).toEqual([{ artists: 'Koxbox', duration: '6:51', title: 'Crystal' }]);
		expect(problems).toEqual([]);
	});

	test('fills the release credit down where Discogs gives the track none', () => {
		const problems: Array<string> = [];
		const tracklist = toTracklist(
			release({ tracklist: [track({ title: 'Woy' })] }),
			'a-review.mdx',
			problems,
		);

		expect(tracklist).toEqual([{ artists: 'Koxbox', title: 'Woy' }]);
	});

	test('omits `duration` rather than writing it empty', () => {
		const problems: Array<string> = [];
		const tracklist = toTracklist(
			release({ tracklist: [track({ duration: '' })] }),
			'a-review.mdx',
			problems,
		);

		expect(tracklist).toStrictEqual([{ artists: 'Koxbox', title: 'A Track' }]);
	});

	test('refuses to fill "Various" down onto a compilation track', () => {
		const problems: Array<string> = [];
		const tracklist = toTracklist(
			release({ artists: [credit('Various')], tracklist: [track({ title: 'Voices' })] }),
			'a-review.mdx',
			problems,
		);

		expect(tracklist).toBeUndefined();
		expect(problems).toEqual(['a-review.mdx: "Voices" has no artist to fill down from']);
	});

	test('reports a release whose tracks are all headings', () => {
		const problems: Array<string> = [];

		expect(
			toTracklist(
				release({ id: 42, tracklist: [track({ type_: 'heading' })] }),
				'a-review.mdx',
				problems,
			),
		).toBeUndefined();
		expect(problems).toEqual(['a-review.mdx: release 42 has no tracks']);
	});

	test('groups an `N-M` tracklist into discs', () => {
		const problems: Array<string> = [];
		const tracklist = toTracklist(
			release({
				tracklist: [
					track({ position: '1-1', title: 'Kuos' }),
					track({ position: '1-2', title: 'Amber' }),
					track({ position: '2-1', title: 'Eagle' }),
				],
			}),
			'a-review.mdx',
			problems,
		);

		expect(tracklist).toEqual([
			{
				title: 'Disc 1',
				tracks: [
					{ artists: 'Koxbox', title: 'Kuos' },
					{ artists: 'Koxbox', title: 'Amber' },
				],
			},
			{ title: 'Disc 2', tracks: [{ artists: 'Koxbox', title: 'Eagle' }] },
		]);
	});

	test('leaves every other position shape flat, single-disc `N-M` included', () => {
		const problems: Array<string> = [];
		const vinyl = toTracklist(
			release({ tracklist: [track({ position: 'A1' }), track({ position: 'B' })] }),
			'a-review.mdx',
			problems,
		);
		const oneDisc = toTracklist(
			release({ tracklist: [track({ position: '1-1' }), track({ position: '1-2' })] }),
			'a-review.mdx',
			problems,
		);

		expect(vinyl).toHaveLength(2);
		expect(vinyl?.[0]).not.toHaveProperty('tracks');
		expect(oneDisc?.[0]).not.toHaveProperty('tracks');
	});
});

describe('toSource', () => {
	// Built through `toTracklist` rather than written literally: the emitted key order is the
	// object's own insertion order, and a literal here would be sorted by the linter
	const tracklist =
		toTracklist(
			release({ tracklist: [track({ duration: '6:51', title: 'Crystal' })] }),
			'a-review.mdx',
			[],
		) ?? [];

	function toWritten(source: string): string {
		const entry = toEntry(source);

		entry?.document.set('tracks', tracklist);

		return entry ? toSource(entry) : '';
	}

	test('writes `tracks` last in the frontmatter and leaves every other key byte-identical', () => {
		const written = toWritten(
			entrySource('artists:', '  - id: koxbox', 'discogsReleaseId: 177089', 'rating: 80'),
		);

		expect(written).toBe(
			[
				'---',
				'title: A Review',
				'artists:',
				'  - id: koxbox',
				'discogsReleaseId: 177089',
				'rating: 80',
				'tracks:',
				'  - artists: Koxbox',
				'    title: Crystal',
				'    duration: "6:51"',
				'---',
				'',
				'The body.',
				'',
				'<TrackList tracks={frontmatter.tracks} />',
				'',
			].join('\n'),
		);
	});

	test('leaves a body that already carries the tag alone', () => {
		const tag = '<TrackList tracks={frontmatter.tracks} />';
		const source = `${entrySource('discogsReleaseId: 1')}\n${tag}\n`;

		expect(toWritten(source).match(/<TrackList/g)).toHaveLength(1);
	});

	test('never mistakes a body line for a frontmatter key', () => {
		const source = [
			'---',
			'discogsReleaseId: 1',
			'---',
			'',
			'tracks: are discussed below.',
			'',
		].join('\n');
		const written = toWritten(source);

		expect(written.indexOf('tracks:')).toBeLessThan(written.indexOf('---', 3));
		expect(written).toContain('tracks: are discussed below.');
	});

	test('reports a file carrying no frontmatter fence', () => {
		expect(toEntry('Just a body.\n')).toBeUndefined();
	});
});
