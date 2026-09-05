import type { ContentEntry } from '#shared/astro-content.ts';

import { toValidationResult } from '#validate-content/validation-result.ts';

const timestampRegex = /^(\d{2}):([0-5]\d):([0-5]\d)(?:\.(\d{1,2}))?$/;

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
// The extractor merges a multi-tracklist mix lossily, so part two can restart at `00:00:00`
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
	const timed = collectTimedTracks(entry);

	const issues: Array<TimestampIssue> = [];

	for (const [index, track] of timed.entries()) {
		const previous = timed[index - 1];

		if (!previous || previous.seconds <= track.seconds) continue;

		issues.push({
			detail: `Track ${track.position.toString()} "${track.title}" at ${track.timestamp} follows track ${previous.position.toString()} at ${previous.timestamp}`,
			location: entry.filePath ?? entry.id,
		});
	}

	return issues;
}

function collectTimedTracks(entry: ContentEntry): Array<TimedTrack> {
	const tracks = entry.data.tracks;

	if (!Array.isArray(tracks)) return [];

	const timed: Array<TimedTrack> = [];

	for (const [index, track] of (tracks as Array<unknown>).entries()) {
		if (track === null || typeof track !== 'object') continue;

		const { timestamp, title } = track as { timestamp?: unknown; title?: unknown };

		if (typeof timestamp !== 'string') continue;

		const seconds = toSeconds(timestamp);

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

// The schema validates shape, so anything reaching here parses; an unparseable value is skipped
function toSeconds(timestamp: string): number | undefined {
	const match = timestampRegex.exec(timestamp);

	if (!match) return undefined;

	const [, hours = '0', minutes = '0', seconds = '0', fraction = '0'] = match;

	return Number(hours) * 3600 + Number(minutes) * 60 + Number(seconds) + Number(`0.${fraction}`);
}
