import { isGroupedTracklist } from '@xsynaptic/shared/tracklist';

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

	if (!isGroupedTracklist<TrackGroupValue>(tracks)) return [{ tracks }];

	return tracks;
}
