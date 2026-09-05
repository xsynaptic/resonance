import { readdirSync, statSync } from 'node:fs';
import path from 'node:path';

import type { ContentEntry } from '#shared/astro-content.ts';
import type { ValidationResult } from '#validate-content/validation-result.ts';

import { extractImageFeaturedIds } from '#shared/images.ts';
import { findComponentTags, getTagProp } from '#validate-content/component-tags.ts';
import { toValidationResult } from '#validate-content/validation-result.ts';

// Media paths are relative to packages/content/media and are plain strings, not Astro assets
// Nothing else catches a typo before the build silently falls back to no image
const imageExtensions = /\.(avif|gif|jpe?g|png|webp)$/i;

interface MissingImageIssue {
	imagePath: string;
	location: string;
}

export function collectMissingImageIssues(
	entries: Array<ContentEntry>,
	mediaFiles: ReadonlySet<string>,
): Array<MissingImageIssue> {
	return entries.flatMap((entry) =>
		[...collectEntryImagePaths(entry)]
			.filter((imagePath) => !mediaFiles.has(imagePath))
			.map((imagePath) => ({ imagePath, location: entry.filePath ?? entry.id })),
	);
}

export function validateImages(entries: Array<ContentEntry>, mediaPath: string): ValidationResult {
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

function collectEntryImagePaths(entry: ContentEntry): Set<string> {
	const selections = Array.isArray(entry.data.selections)
		? (entry.data.selections as Array<Record<string, unknown>>)
		: [];
	const bodyImagePaths = findComponentTags(entry.body ?? '', ['Img']).map((tag) =>
		getTagProp(tag, 'src'),
	);

	const values = [...selections.map((selection) => selection.imageFeatured), ...bodyImagePaths];

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
