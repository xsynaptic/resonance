import type { ContentEntry } from '#shared/astro-content.ts';

import { toValidationResult } from '#validate-content/validation-result.ts';

// `<TrackList tracks={frontmatter.tracks} />` and `<Selections items={frontmatter.selections} />`
// are the only things that render those fields, and the layouts do not
// So a deleted tag hides the data and a field with no tag never reaches the page, both silently
const markers = [
	{ field: 'selections', tag: '<Selections' },
	{ field: 'tracks', tag: '<TrackList' },
] as const;

interface MarkerIssue {
	detail: string;
	location: string;
}

export function validateBodyMarkers(entries: Array<ContentEntry>) {
	const issues = entries.flatMap((entry) => collectEntryMarkerIssues(entry));

	return toValidationResult(
		issues.map(({ detail, location }) => ({ message: `${location}: ${detail}` })),
		{
			fail: `Found ${issues.length.toString()} entry body marker mismatch(es)`,
			pass: 'Body markers match their frontmatter',
		},
	);
}

function collectEntryMarkerIssues(entry: ContentEntry): Array<MarkerIssue> {
	const body = entry.body ?? '';
	const issues: Array<MarkerIssue> = [];

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
