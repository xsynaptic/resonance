import { toStatsKey } from '@xsynaptic/shared/platform-stats';

import type { ContentEntry } from '#shared/astro-content.ts';
import type { ValidationIssue, ValidationResult } from '#validate-content/validation-result.ts';

import { toValidationResult } from '#validate-content/validation-result.ts';

// The one SoundCloud account this site publishes as; a URL under any other is somebody else's
const soundcloudAccountPrefix = 'https://soundcloud.com/djbasilisk/';

// Mixes went out under several Mixcloud accounts, so any Mixcloud URL in `links` counts
const mixcloudUrlPattern = /^https?:\/\/(www\.)?mixcloud\.com\//;

// `undefined` where a service's stats file is absent, so its keys go unchecked rather than failing
export interface PlatformKeys {
	mixcloud?: Set<string> | undefined;
	soundcloud?: Set<string> | undefined;
}

// The count renders unconditionally, and `links` is where the backlink SoundCloud's terms require lives
// An unresolved key is a rename: the count survives it, tied to the track id, but the join does not
export function validatePlatformLinks(
	entries: Array<ContentEntry>,
	keys: PlatformKeys,
): ValidationResult {
	const issues: Array<ValidationIssue> = [];

	for (const entry of entries) {
		const location = entry.filePath ?? entry.id;
		const links = toUrls(entry.data.links);
		const mixcloudUrls = toUrls(entry.data.mixcloudLink);
		const soundcloudUrls = toUrls(entry.data.soundcloudLink);

		issues.push(
			...collectMismatches({
				backlinks: links.filter((link) => mixcloudUrlPattern.test(link)),
				field: 'mixcloudLink',
				location,
				urls: mixcloudUrls,
			}),
			...collectMismatches({
				backlinks: links.filter((link) => link.startsWith(soundcloudAccountPrefix)),
				field: 'soundcloudLink',
				location,
				urls: soundcloudUrls,
			}),
			...collectUnresolved({
				field: 'mixcloudLink',
				keys: keys.mixcloud,
				location,
				urls: mixcloudUrls,
			}),
			...collectUnresolved({
				field: 'soundcloudLink',
				keys: keys.soundcloud,
				location,
				urls: soundcloudUrls,
			}),
		);
	}

	const result = toValidationResult(issues, {
		fail: `Found ${issues.length.toString()} platform link issue(s)`,
		pass: 'Platform links resolve',
	});
	const notes = toSkippedNotes(keys);

	return notes.length > 0 ? { ...result, notes } : result;
}

// A stale copy in `links` stays linked after a rename, so each URL must appear in both fields
function collectMismatches({
	backlinks,
	field,
	location,
	urls,
}: {
	backlinks: Array<string>;
	field: string;
	location: string;
	urls: Array<string>;
}): Array<ValidationIssue> {
	const backlinkKeys = new Set(backlinks.map((link) => toStatsKey(link)));
	const embedKeys = new Set(urls.map((url) => toStatsKey(url)));

	return [
		...[...backlinkKeys.difference(embedKeys)].map((key) => ({
			message: `${location}: \`links\` has ${key}, missing from \`${field}\``,
		})),
		...[...embedKeys.difference(backlinkKeys)].map((key) => ({
			message: `${location}: \`${field}\` has ${key}, missing from \`links\``,
		})),
	];
}

function collectUnresolved({
	field,
	keys,
	location,
	urls,
}: {
	field: string;
	keys: Set<string> | undefined;
	location: string;
	urls: Array<string>;
}): Array<ValidationIssue> {
	if (!keys) return [];

	return urls
		.map((url) => toStatsKey(url))
		.filter((key) => !keys.has(key))
		.map((key) => ({
			message: `${location}: \`${field}\` ${key} matches no track in the last pull`,
		}));
}

function toSkippedNotes(keys: PlatformKeys): Array<string> {
	const skipped: Array<string> = [];

	if (!keys.mixcloud) skipped.push('mixcloud');
	if (!keys.soundcloud) skipped.push('soundcloud');

	if (skipped.length === 0) return [];

	return [`   No pulled stats for: ${skipped.join(', ')}; those keys went unchecked`];
}

function toUrls(value: unknown): Array<string> {
	if (typeof value === 'string') return [value];
	if (Array.isArray(value)) return value.filter((item) => typeof item === 'string');

	return [];
}
