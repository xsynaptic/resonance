import type { ContentEntry } from '@xsynaptic/astro-scripts';

import { toValidationResult } from '@xsynaptic/astro-scripts';
import { getContentPath } from '@xsynaptic/shared/routing';
import { getUrlPathIndexing } from '@xsynaptic/shared/sitemap';

export function validateIndexedPaths(entries: Array<ContentEntry>) {
	const issues = entries.flatMap((entry) => {
		const contentPath = getContentPath(entry.collection, entry.id);

		if (getUrlPathIndexing(contentPath).index) return [];

		return [
			{
				location: entry.filePath ?? entry.id,
				message: `${contentPath} reads as a page number, so it would get noindex; give it a non-numeric id`,
			},
		];
	});

	return toValidationResult(issues, {
		fail: `Found ${issues.length.toString()} entry id(s) that would not be indexed`,
		pass: 'Every entry path is indexed',
	});
}
