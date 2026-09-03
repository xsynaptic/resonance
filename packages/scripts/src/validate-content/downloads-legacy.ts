import type { DataStoreEntry } from '../shared/data-store.js';

import { toValidationResult } from './validation-result.js';

// The frozen counts are keyed on format, so a mix that drops a format keeps a count nothing renders
export function validateDownloadsLegacy(entries: Array<DataStoreEntry>) {
	const issues: Array<{ format: string; location: string }> = [];

	for (const entry of entries) {
		const downloadsLegacy = entry.data.downloadsLegacy as Record<string, number> | undefined;

		if (!downloadsLegacy) continue;

		const files = (entry.data.files as Array<string> | undefined) ?? [];

		for (const format of Object.keys(downloadsLegacy)) {
			const hasFile = files.some((name) => name.toLowerCase().endsWith(`.${format.toLowerCase()}`));

			if (!hasFile) issues.push({ format, location: entry.filePath ?? entry.id });
		}
	}

	return toValidationResult(
		issues.map(({ format, location }) => ({
			message: `${location}: \`downloadsLegacy.${format}\` has no matching file in \`files\``,
		})),
		{
			fail: `Found ${issues.length.toString()} orphaned legacy download count(s)`,
			pass: 'Legacy download counts valid',
		},
	);
}
