import type { QueueCuePoint } from '@xsynaptic/player';
import type { CollectionEntry } from 'astro:content';

import { parseTimestampSeconds } from '@xsynaptic/shared/schemas';

import type { TrackValue } from '#lib/schemas/audio.ts';
import type { CreditValue } from '#lib/schemas/credits.ts';

import { buildCueSheet } from '#lib/utils/cue-sheet.ts';
import { resolveCredits, toCreditArray } from '#lib/utils/terms.ts';
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
				const startSeconds =
					track.timestamp === undefined ? undefined : parseTimestampSeconds(track.timestamp);
				if (startSeconds === undefined) return;

				return {
					artistLine: (await joinArtists(toCreditArray(track.artists))) ?? '',
					startSeconds,
					title: track.title,
				} satisfies QueueCuePoint;
			}),
	);

	return points.filter((point) => point !== undefined);
}

export async function getMixCueSheets(
	entry: CollectionEntry<'mixes'>,
): Promise<Array<{ audioFile: string; text: string }>> {
	const performer = await joinArtists(entry.data.alias ? [entry.data.alias] : undefined);

	const sheets = await Promise.all(
		[...toTracksByFile(entry)].map(async ([audioFile, fileTracks]) => {
			if (fileTracks.every((track) => track.timestamp === undefined)) return;

			const tracks = await Promise.all(
				fileTracks.map(async (track) => ({
					performer: await joinArtists(toCreditArray(track.artists)),
					timestamp: track.timestamp,
					title: track.title,
				})),
			);

			return {
				audioFile,
				text: buildCueSheet({
					// dateCreated parses as UTC, so read it back the same way or January dates slip a year
					date: String(entry.data.dateCreated.getUTCFullYear()),
					fileName: audioFile,
					performer,
					title: entry.data.title,
					tracks,
				}),
			};
		}),
	);

	return sheets.filter((sheet) => sheet !== undefined);
}

// The presence of timestamps is the whole gate
// Shared by the endpoint and the layout so the two cannot disagree about which mixes offer a download
export function hasMixTimestamps(entry: CollectionEntry<'mixes'>): boolean {
	return toFlatTracks(entry.data.tracks).some((track) => track.timestamp !== undefined);
}

async function joinArtists(credits: Array<CreditValue> | undefined): Promise<string | undefined> {
	const resolved = await resolveCredits('artists', credits);
	if (resolved.length === 0) return undefined;

	return resolved.map((artist) => artist.name).join(', ');
}

function toTracksByFile(entry: CollectionEntry<'mixes'>): Map<string, Array<TrackValue>> {
	const groups = toTrackGroups(entry.data.tracks);
	const claimed = new Set(groups.flatMap((group) => group.files ?? []));
	const unclaimed = (entry.data.files ?? []).filter((file) => !claimed.has(file));
	const tracksByFile = new Map<string, Array<TrackValue>>();

	for (const group of groups) {
		const files = group.files ?? unclaimed;

		for (const file of files) {
			tracksByFile.set(file, [...(tracksByFile.get(file) ?? []), ...group.tracks]);
		}
	}

	return tracksByFile;
}
