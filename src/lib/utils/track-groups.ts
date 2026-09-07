import type { TrackGroupValue, TracklistValue, TrackValue } from '#lib/schemas/audio.ts';

export interface TrackGroup {
	description?: string | undefined;
	files?: Array<string> | undefined;
	title?: string | undefined;
	tracks: Array<TrackValue>;
}

export function toFlatTracks(tracks: TracklistValue | undefined): Array<TrackValue> {
	return toTrackGroups(tracks).flatMap((group) => group.tracks);
}

// Every consumer reads groups, so none of them branches on whether the flat or grouped form was authored
export function toTrackGroups(tracks: TracklistValue | undefined): Array<TrackGroup> {
	if (!tracks || tracks.length === 0) return [];

	// The schema rejects a mixed array, so the first element settles the shape for all of them
	if (!isGrouped(tracks)) return [{ tracks }];

	return tracks;
}

function isGrouped(tracks: TracklistValue): tracks is Array<TrackGroupValue> {
	const [first] = tracks;

	return first !== undefined && 'tracks' in first;
}
