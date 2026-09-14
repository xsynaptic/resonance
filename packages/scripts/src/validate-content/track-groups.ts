import type { ContentEntry } from '#shared/astro-content.ts';
import type { LocatedIssue } from '#validate-content/validation-result.ts';

import { isGroupedTracklist } from '#shared/entries.ts';
import { toLocatedValidationResult } from '#validate-content/validation-result.ts';

interface TrackGroup {
	files: Array<string>;
	hasTimestamps: boolean;
	title: string;
}

// A group's `files` point into the mix's own manifest and decide which file its cue sheet runs against
// Reviews are exempt: they carry neither files nor timestamps
export function validateTrackGroups(entries: Array<ContentEntry>) {
	const issues = entries.flatMap((entry) => collectEntryGroupIssues(entry));

	return toLocatedValidationResult(issues, {
		fail: `Found ${issues.length.toString()} track group file problem(s)`,
		pass: 'Track group files valid',
	});
}

function collectEntryGroupIssues(entry: ContentEntry): Array<LocatedIssue> {
	const groups = toGroups(entry.data.tracks);

	if (groups.length === 0) return [];

	const files = (entry.data.files as Array<string> | undefined) ?? [];
	const location = entry.filePath ?? entry.id;
	const owners = new Map<string, string>();

	const details = groups.flatMap((group) => collectGroupFileDetails(group, files, owners));

	details.push(...collectTimestampDetails(groups), ...collectUnnamedFileDetails(files, owners));

	return details.map((detail) => ({ detail, location }));
}

// `owners` accumulates across the groups of one entry, so the second claim on a file is the one reported
function collectGroupFileDetails(
	group: TrackGroup,
	files: Array<string>,
	owners: Map<string, string>,
): Array<string> {
	const details: Array<string> = [];

	for (const file of group.files) {
		if (!files.includes(file))
			details.push(`group "${group.title}" names "${file}", missing from \`files\``);

		const owner = owners.get(file);

		if (owner === undefined) {
			owners.set(file, group.title);
			continue;
		}

		details.push(`groups "${owner}" and "${group.title}" both name "${file}"`);
	}

	return details;
}

// Two timestamped groups sharing the mix's files would write two sheets to one filename
function collectTimestampDetails(groups: Array<TrackGroup>): Array<string> {
	const timed = groups.filter((group) => group.hasTimestamps);

	if (timed.length < 2) return [];

	return timed
		.filter((group) => group.files.length === 0)
		.map(
			(group) =>
				`group "${group.title}" carries timestamps alongside another and names no \`files\``,
		);
}

// Once any group names files the header stops offering the mix's, so an unnamed one is offered nowhere
function collectUnnamedFileDetails(
	files: Array<string>,
	owners: Map<string, string>,
): Array<string> {
	if (owners.size === 0) return [];

	return files
		.filter((file) => !owners.has(file))
		.map((file) => `"${file}" is named by no group and drops off the page`);
}

function hasTimestamp(track: unknown): boolean {
	if (track === null || typeof track !== 'object') return false;

	return typeof (track as { timestamp?: unknown }).timestamp === 'string';
}

// Only a grouped tracklist has anything to check; a flat one names no files of its own
function toGroups(tracks: unknown): Array<TrackGroup> {
	if (!Array.isArray(tracks) || !isGroupedTracklist(tracks)) return [];

	return (tracks as Array<unknown>).map((value) => {
		const group = (value ?? {}) as { files?: unknown; title?: unknown; tracks?: unknown };
		const nested = Array.isArray(group.tracks) ? (group.tracks as Array<unknown>) : [];

		return {
			files: Array.isArray(group.files) ? (group.files as Array<string>) : [],
			hasTimestamps: nested.some((track) => hasTimestamp(track)),
			title: typeof group.title === 'string' ? group.title : '(untitled)',
		};
	});
}
