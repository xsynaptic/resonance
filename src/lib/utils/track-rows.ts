import { parseTimestampSeconds } from '@xsynaptic/shared/schemas';

import type { TrackValue } from '#lib/schemas/audio.ts';
import type { LinkedName } from '#lib/utils/terms.ts';
import type { TrackGroup } from '#lib/utils/track-groups.ts';

import { resolveCredits, toCreditArray } from '#lib/utils/terms.ts';

export interface TrackGroupRows {
	cueSlug: string | undefined;
	description: string | undefined;
	files: Array<string> | undefined;
	hasMeta: boolean;
	rows: Array<TrackRow>;
	title: string | undefined;
}

export interface TrackRow {
	artists: Array<LinkedName>;
	hasMeta: boolean;
	labels: Array<LinkedName>;
	metaSeparator: string;
	position: string;
	remixCredit: Array<LinkedName>;
	startSeconds: number | undefined;
	time: string | undefined;
	title: string;
	year: string | undefined;
}

export async function buildTrackGroupRows(
	group: TrackGroup,
	slug: string | undefined,
): Promise<TrackGroupRows> {
	const hasTimestamp = group.tracks.some((track) => track.timestamp !== undefined);
	const rows = await Promise.all(group.tracks.map(buildRow));

	return {
		cueSlug: hasTimestamp && group.files ? slug : undefined,
		description: group.description,
		files: group.files,
		hasMeta: rows.some((row) => row.hasMeta),
		rows,
		title: group.title,
	};
}

// Every separator in the styled markup comes from CSS, so a feed gets one text line per track
export function toFeedLine(row: TrackRow): string {
	const artists = row.artists.map((artist) => artist.name).join(' / ');
	const remix =
		row.remixCredit.length > 0
			? ` (${row.remixCredit.map((artist) => artist.name).join(' / ')} remix)`
			: '';
	const labels = row.labels.map((label) => label.name).join(' / ');
	const meta = row.hasMeta ? ` (${labels}${row.metaSeparator}${row.year ?? ''})` : '';
	const time = row.time ? ` [${row.time}]` : '';
	// The list numbers itself, so only a vinyl side ("A1") is worth spelling out
	const position = /^\d+$/.test(row.position) ? '' : `${row.position}. `;

	return `${position}${artists === '' ? '' : `${artists} - `}${row.title}${remix}${meta}${time}`;
}

async function buildRow(track: TrackValue, index: number): Promise<TrackRow> {
	const [artists, labels, mixArtists] = await Promise.all([
		resolveCredits('artists', toCreditArray(track.artists)),
		resolveCredits('labels', track.labels),
		resolveCredits('artists', toCreditArray(track.mixArtists)),
	]);

	return {
		artists,
		hasMeta: labels.length > 0 || Boolean(track.year),
		labels,
		metaSeparator: labels.length > 0 && track.year ? ', ' : '',
		// A release track carries its own position ("A1"); a mix track falls back to the ordinal
		position: padOrdinal(track.position ?? String(index + 1)),
		remixCredit: visibleMixArtists(track.title, mixArtists),
		startSeconds:
			track.timestamp === undefined ? undefined : parseTimestampSeconds(track.timestamp),
		time: track.duration,
		title: track.title,
		year: track.year,
	};
}

// A leading zero keeps the numeral column a rectangle; a vinyl position ("A1") is left alone
function padOrdinal(position: string): string {
	return /^\d$/.test(position) ? `0${position}` : position;
}

// Some extracted titles already carry the remix inline (e.g. "The 5th World (Ken Zo Remix)")
// Suppress the credit only when every named artist appears, so a partial group still renders
function visibleMixArtists(title: string, mixArtists: Array<LinkedName>): Array<LinkedName> {
	if (mixArtists.length === 0) return [];

	const lowerTitle = title.toLowerCase();
	const isAllNamed = mixArtists.every((artist) => lowerTitle.includes(artist.name.toLowerCase()));

	return isAllNamed ? [] : mixArtists;
}
