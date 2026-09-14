import type { ContentEntry } from '#shared/astro-content.ts';
import type { LocatedIssue } from '#validate-content/validation-result.ts';

import { toLocatedValidationResult } from '#validate-content/validation-result.ts';

// `<TrackList tracks={frontmatter.tracks} />` and `<Selections items={frontmatter.selections} />`
// are the only things that render those fields, and the layouts do not
// So a deleted tag hides the data and a field with no tag never reaches the page, both silently
const markers = [
	{ field: 'selections', tag: '<Selections' },
	{ field: 'tracks', tag: '<TrackList' },
] as const;

export function validateBodyMarkers(entries: Array<ContentEntry>) {
	const issues = entries.flatMap((entry) => collectEntryMarkerIssues(entry));

	return toLocatedValidationResult(issues, {
		fail: `Found ${issues.length.toString()} entry body marker mismatch(es)`,
		pass: 'Body markers match their frontmatter',
	});
}

function collectEntryMarkerIssues(entry: ContentEntry): Array<LocatedIssue> {
	const body = entry.body ?? '';
	const issues: Array<LocatedIssue> = [];

	for (const { field, tag } of markers) {
		const value = entry.data[field];
		const hasData = Array.isArray(value) && value.length > 0;

		if (hasData === body.includes(tag)) continue;

		issues.push({
			detail: hasData ? `${field} with no ${tag}> tag` : `${tag}> tag with no ${field}`,
			location: entry.filePath ?? entry.id,
		});
	}

	return issues;
}
