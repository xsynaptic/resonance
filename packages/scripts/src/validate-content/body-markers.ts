import type { ContentEntry, ValidationIssue } from '@xsynaptic/astro-scripts';

import { toValidationResult } from '@xsynaptic/astro-scripts';

// `<TrackList tracks={frontmatter.tracks} />` and `<Selections items={frontmatter.selections} />`
// are the only things that render those fields, and the layouts do not
// So a deleted tag hides the data and a field with no tag never reaches the page, both silently
const markers = [
	{ field: 'selections', tag: '<Selections' },
	{ field: 'tracks', tag: '<TrackList' },
] as const;

export function validateBodyMarkers(entries: Array<ContentEntry>) {
	const issues = entries.flatMap((entry) => collectEntryMarkerIssues(entry));

	return toValidationResult(issues, {
		fail: `Found ${issues.length.toString()} entry body marker mismatch(es)`,
		pass: 'Body markers match their frontmatter',
	});
}

function collectEntryMarkerIssues(entry: ContentEntry): Array<ValidationIssue> {
	const body = entry.body ?? '';
	const issues: Array<ValidationIssue> = [];

	for (const { field, tag } of markers) {
		const value = entry.data[field];
		const hasData = Array.isArray(value) && value.length > 0;

		if (hasData === body.includes(tag)) continue;

		issues.push({
			location: entry.filePath ?? entry.id,
			message: hasData ? `${field} with no ${tag}> tag` : `${tag}> tag with no ${field}`,
		});
	}

	return issues;
}
