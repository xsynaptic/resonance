import { readdirSync, statSync } from 'node:fs';
import path from 'node:path';

import type { DataStoreEntry } from '../shared/data-store.js';
import type { ValidationResult } from './validation-result.js';

import { extractImageFeaturedIds } from '../shared/images.js';
import { toValidationResult } from './validation-result.js';

// Media paths are relative to packages/content/_media and are plain strings, not Astro assets
// Nothing else catches a typo before the build silently falls back to no image
const imageExtensions = /\.(avif|gif|jpe?g|png|webp)$/i;
const imgTagRegex = /<Img\s+[^>]*id=["']([^"']+)["']/g;

interface MissingImageIssue {
	imagePath: string;
	location: string;
}

export function collectMissingImageIssues(
	entries: Array<DataStoreEntry>,
	mediaFiles: ReadonlySet<string>,
): Array<MissingImageIssue> {
	return entries.flatMap((entry) =>
		[...collectEntryImagePaths(entry)]
			.filter((imagePath) => !mediaFiles.has(imagePath))
			.map((imagePath) => ({ imagePath, location: entry.filePath ?? entry.id })),
	);
}

export function validateImages(
	entries: Array<DataStoreEntry>,
	mediaPath: string,
): ValidationResult {
	const mediaFiles = collectMediaFiles(mediaPath);

	// Originals are gitignored, so an empty tree is a missing checkout rather than a content fault
	if (mediaFiles.size === 0) {
		return { issues: [], status: 'warn', summary: `No image files found in ${mediaPath}` };
	}

	const issues = collectMissingImageIssues(entries, mediaFiles);

	return toValidationResult(
		issues.map(({ imagePath, location }) => ({
			message: `${location}: no image file at "${imagePath}"`,
		})),
		{
			fail: `Found ${issues.length.toString()} missing image reference(s)`,
			pass: `${mediaFiles.size.toString()} image files, every reference resolved`,
		},
	);
}

function collectEntryImagePaths(entry: DataStoreEntry): Set<string> {
	const selections = Array.isArray(entry.data.selections)
		? (entry.data.selections as Array<Record<string, unknown>>)
		: [];
	const bodyMatches = [...(entry.body ?? '').matchAll(imgTagRegex)];

	const values = [
		...selections.map((selection) => selection.imageFeatured),
		...bodyMatches.map((match) => match[1]),
	];

	return new Set([
		...extractImageFeaturedIds(entry.data),
		...values.filter((value): value is string => typeof value === 'string'),
	]);
}

function collectMediaFiles(mediaPath: string): Set<string> {
	const files = new Set<string>();

	function walk(directory: string, prefix: string): void {
		for (const name of readdirSync(directory)) {
			const fullPath = path.join(directory, name);
			const relativePath = prefix === '' ? name : `${prefix}/${name}`;

			if (statSync(fullPath).isDirectory()) {
				walk(fullPath, relativePath);
				continue;
			}
			if (imageExtensions.test(name)) files.add(relativePath);
		}
	}

	walk(mediaPath, '');

	return files;
}
