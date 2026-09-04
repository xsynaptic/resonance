import type { ContentEntry } from '../shared/astro-content.js';
import type { ValidationIssue, ValidationResult } from './validation-result.js';

import { toStatsKey } from '../platform-stats/platform-stats-file.js';
import { toValidationResult } from './validation-result.js';

// The one SoundCloud account this site publishes as; a URL under any other is somebody else's
const soundcloudAccountPrefix = 'https://soundcloud.com/djbasilisk/';

// `undefined` where a service's stats file is absent, so its keys go unchecked rather than failing
export interface PlatformKeys {
	mixcloud?: Set<string> | undefined;
	soundcloud?: Set<string> | undefined;
}

// The count renders unconditionally, and `links` is where the backlink SoundCloud's terms require lives
// An unresolved key is a rename: the count survives it, tied to the track id, but the join does not
export function validatePlatformEmbeds(
	entries: Array<ContentEntry>,
	keys: PlatformKeys,
): ValidationResult {
	const issues: Array<ValidationIssue> = [];

	for (const entry of entries) {
		const location = entry.filePath ?? entry.id;
		const embeds = toUrls(entry.data.soundcloudEmbed);
		const embedKeys = new Set(embeds.map((url) => toStatsKey(url)));
		const linkedKeys = new Set(
			toUrls(entry.data.links)
				.filter((link) => link.startsWith(soundcloudAccountPrefix))
				.map((link) => toStatsKey(link)),
		);

		issues.push(
			...[...linkedKeys.difference(embedKeys)].map((key) => ({
				message: `${location}: \`links\` has ${key}, missing from \`soundcloudEmbed\``,
			})),
			...[...embedKeys.difference(linkedKeys)].map((key) => ({
				message: `${location}: \`soundcloudEmbed\` has ${key}, missing from \`links\``,
			})),
			...collectUnresolved(
				location,
				'mixcloudEmbed',
				toUrls(entry.data.mixcloudEmbed),
				keys.mixcloud,
			),
			...collectUnresolved(location, 'soundcloudEmbed', embeds, keys.soundcloud),
		);
	}

	const result = toValidationResult(issues, {
		fail: `Found ${issues.length.toString()} platform embed issue(s)`,
		pass: 'Platform embeds resolve',
	});
	const notes = toSkippedNotes(keys);

	return notes.length > 0 ? { ...result, notes } : result;
}

function collectUnresolved(
	location: string,
	field: string,
	urls: Array<string>,
	keys: Set<string> | undefined,
): Array<ValidationIssue> {
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
