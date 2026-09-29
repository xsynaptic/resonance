import type { ContentEntry } from '#shared/astro-content.ts';

import { toLocatedValidationResult } from '#validate-content/validation-result.ts';

// An unknown entryId renders a bare row with no title or body, behind only a build warning
export function validateSelectionEntryIds(
	entries: Array<ContentEntry>,
	validIds: ReadonlySet<string>,
) {
	const issues = entries.flatMap((entry) => {
		const selections = (entry.data.selections ?? []) as Array<{ entryId?: string }>;

		return selections
			.map(({ entryId }, index) => ({ entryId, index }))
			.filter(({ entryId }) => entryId !== undefined && !validIds.has(entryId))
			.map(({ entryId = '', index }) => ({
				detail: `selections[${index.toString()}].entryId "${entryId}" names no entry`,
				location: entry.filePath ?? entry.id,
			}));
	});

	return toLocatedValidationResult(issues, {
		fail: `Found ${issues.length.toString()} unknown selection entryId(s)`,
		pass: 'Selection entryIds valid',
	});
}
