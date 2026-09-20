import { parseTimestampSeconds } from '@xsynaptic/shared/schemas';
import { isGroupedTracklist } from '@xsynaptic/shared/tracklist';

import type { ContentEntry } from '#shared/astro-content.ts';

import { toValidationResult } from '#validate-content/validation-result.ts';

interface TimedTrack {
	position: number;
	seconds: number;
	timestamp: string;
	title: string;
}

interface TimestampIssue {
	detail: string;
	location: string;
}

// Timestamps become cue sheet `INDEX` values; the schema enforces their shape, not their order
// A group is its own audio file, so order is checked within a group and never across
// A flat list restarting at zero is the extractor's lossy multi-tracklist merge, and is still an issue
export function collectTimestampIssues(entries: Array<ContentEntry>) {
	return entries.flatMap((entry) => collectEntryTimestampIssues(entry));
}

export function validateTrackTimestamps(entries: Array<ContentEntry>) {
	const issues = collectTimestampIssues(entries);
	const detailsByLocation = new Map<string, Array<string>>();

	for (const issue of issues) {
		const details = detailsByLocation.get(issue.location) ?? [];

		details.push(issue.detail);
		detailsByLocation.set(issue.location, details);
	}

	return toValidationResult(
		[...detailsByLocation].map(([location, details]) => ({ details, message: location })),
		{
			fail: `Found ${issues.length.toString()} out-of-order timestamp(s)`,
			pass: 'Track timestamps run forwards',
		},
	);
}

function collectEntryTimestampIssues(entry: ContentEntry) {
	const location = entry.filePath ?? entry.id;

	return toTrackGroups(entry).flatMap((group) =>
		collectGroupTimestampIssues(collectTimedTracks(group), location),
	);
}

function collectGroupTimestampIssues(timed: Array<TimedTrack>, location: string) {
	const issues: Array<TimestampIssue> = [];

	for (const [index, track] of timed.entries()) {
		const previous = timed[index - 1];

		if (!previous || previous.seconds <= track.seconds) continue;

		issues.push({
			detail: `Track ${track.position.toString()} "${track.title}" at ${track.timestamp} follows track ${previous.position.toString()} at ${previous.timestamp}`,
			location,
		});
	}

	return issues;
}

function collectTimedTracks(tracks: Array<unknown>): Array<TimedTrack> {
	const timed: Array<TimedTrack> = [];

	for (const [index, track] of tracks.entries()) {
		if (track === null || typeof track !== 'object') continue;

		const { timestamp, title } = track as { timestamp?: unknown; title?: unknown };

		if (typeof timestamp !== 'string') continue;

		const seconds = parseTimestampSeconds(timestamp);

		if (seconds === undefined) continue;

		timed.push({
			position: index + 1,
			seconds,
			timestamp,
			title: typeof title === 'string' ? title : '(untitled)',
		});
	}

	return timed;
}

function toTrackGroups(entry: ContentEntry): Array<Array<unknown>> {
	const tracks = entry.data.tracks;

	if (!Array.isArray(tracks)) return [];

	const values = tracks as Array<unknown>;

	if (!isGroupedTracklist(values)) return [values];

	return values.map((group) => {
		const nested = (group as { tracks?: unknown }).tracks;

		return Array.isArray(nested) ? (nested as Array<unknown>) : [];
	});
}
