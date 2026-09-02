import type { DataStoreEntry } from '../shared/data-store.js';

import { toValidationResult } from './validation-result.js';

// Reviews shelve by year of release, and the root is the "no releaseYear yet" shelf
// Slugs are path-independent, so a file left in the wrong folder breaks nothing and shows nowhere
interface FolderIssue {
	expected: string;
	found: string;
	location: string;
}

export function validateReviewFolders(entries: Array<DataStoreEntry>) {
	const issues = collectReviewFolderIssues(entries);

	return toValidationResult(
		issues.map(({ expected, found, location }) => ({
			message: `${location}: filed under ${found}, releaseYear says ${expected}`,
		})),
		{
			fail: `Found ${issues.length.toString()} review(s) in the wrong year folder`,
			pass: 'Reviews shelved by release year',
		},
	);
}

function collectReviewFolderIssues(entries: Array<DataStoreEntry>) {
	const issues: Array<FolderIssue> = [];

	for (const entry of entries) {
		if (entry.filePath === undefined) continue;

		const releaseYear = typeof entry.data.releaseYear === 'string' ? entry.data.releaseYear : '';
		const folder = folderOf(entry.filePath);

		if (folder === releaseYear) continue;

		issues.push({
			expected: releaseYear === '' ? 'the collection root' : releaseYear,
			found: folder === '' ? 'the collection root' : folder,
			location: entry.filePath,
		});
	}

	return issues;
}

// `collections/reviews/1995/foo.mdx` yields `1995`; a file at the collection root yields ''
function folderOf(filePath: string): string {
	const segments = filePath.split('/');
	const index = segments.lastIndexOf('reviews');

	if (index === -1) return '';

	return segments.length > index + 2 ? (segments[index + 1] ?? '') : '';
}
