import type { ContentEntry } from '@xsynaptic/astro-scripts';

import { toValidationResult } from '@xsynaptic/astro-scripts';

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
				location: entry.filePath ?? entry.id,
				message: `selections[${index.toString()}].entryId "${entryId}" names no entry`,
			}));
	});

	return toValidationResult(issues, {
		fail: `Found ${issues.length.toString()} unknown selection entryId(s)`,
		pass: 'Selection entryIds valid',
	});
}
