import type { QueueCuePoint } from '@xsynaptic/player';
import type { CollectionEntry } from 'astro:content';

import type { RefValue } from '#lib/schemas/refs.ts';

import { buildCueSheet } from '#lib/utils/cue-sheet.ts';
import { resolveRefs, toRefArray } from '#lib/utils/terms.ts';
import { toFlatTracks, toTrackGroups } from '#lib/utils/track-groups.ts';

// The player's index into a mix, resolved at build time because the browser has no artists catalog
export async function getMixCuePoints(
	entry: CollectionEntry<'mixes'>,
): Promise<Array<QueueCuePoint>> {
	if (!hasMixTimestamps(entry)) return [];

	const groups = toTrackGroups(entry.data.tracks);
	// The player streams one file per mix, so part two's offsets would run against part one's stream
	const scoped = groups.some((group) => group.files !== undefined) ? groups.slice(0, 1) : groups;

	const points = await Promise.all(
		scoped
			.flatMap((group) => group.tracks)
			.map(async (track) => {
				const startS =
					track.timestamp === undefined ? undefined : parseTimestampSeconds(track.timestamp);
				if (startS === undefined) return;

				return {
					artistLine: (await joinArtists(toRefArray(track.artists))) ?? '',
					startS,
					title: track.title,
				} satisfies QueueCuePoint;
			}),
	);

	return points.filter((point) => point !== undefined);
}

// One sheet per group per file: a FLAC cue is useless against the MP3, so the two are presented as a pair
// A group naming no files inherits the mix's, so a flat tracklist emits what it always did
export async function getMixCueSheets(
	entry: CollectionEntry<'mixes'>,
): Promise<Array<{ audioFile: string; text: string }>> {
	const mixFiles = entry.data.files ?? [];
	const performer = await joinArtists(entry.data.alias ? [entry.data.alias] : undefined);

	const sheets = await Promise.all(
		toTrackGroups(entry.data.tracks).map(async (group) => {
			const files = group.files ?? mixFiles;
			if (files.length === 0) return [];
			if (group.tracks.every((track) => track.timestamp === undefined)) return [];

			const tracks = await Promise.all(
				group.tracks.map(async (track) => ({
					performer: await joinArtists(toRefArray(track.artists)),
					timestamp: track.timestamp,
					title: track.title,
				})),
			);

			return files.map((audioFile) => ({
				audioFile,
				text: buildCueSheet({
					// dateCreated parses as UTC, so read it back the same way or January dates slip a year
					date: String(entry.data.dateCreated.getUTCFullYear()),
					fileName: audioFile,
					performer,
					title: entry.data.title,
					tracks,
				}),
			}));
		}),
	);

	return sheets.flat();
}

// The presence of timestamps is the whole gate
// Shared by the endpoint and the layout so the two cannot disagree about which mixes offer a download
export function hasMixTimestamps(entry: CollectionEntry<'mixes'>): boolean {
	return toFlatTracks(entry.data.tracks).some((track) => track.timestamp !== undefined);
}

// Catalog refs and free text both collapse to a display name; a cue sheet has nowhere to put a link
async function joinArtists(refs: Array<RefValue> | undefined): Promise<string | undefined> {
	const resolved = await resolveRefs('artists', refs);
	if (resolved.length === 0) return undefined;

	return resolved.map((ref) => ref.label).join(', ');
}

// The fractional part is hundredths of a second, matching the schema's `HH:MM:SS.dd`
function parseTimestampSeconds(timestamp: string): number | undefined {
	const match = /^(\d+):(\d+):(\d+)(?:\.(\d{1,2}))?$/.exec(timestamp);
	if (!match) return undefined;

	const [, hours = '0', minutes = '0', seconds = '0', fraction] = match;
	const hundredths = fraction === undefined ? 0 : Number(fraction.padEnd(2, '0'));

	return Number(hours) * 3600 + Number(minutes) * 60 + Number(seconds) + hundredths / 100;
}
