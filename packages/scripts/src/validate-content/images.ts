import type { ContentEntry, ValidationResult } from '@xsynaptic/astro-scripts';

import { listImageSources } from '@xsynaptic/astro-image-pipeline/node';
import { findComponentTags, getTagProp, toValidationResult } from '@xsynaptic/astro-scripts';

import { extractImageFeaturedIds } from '#shared/images.ts';

// Media paths are relative to the content package's `media/` and are plain strings, not Astro assets
// Nothing else catches a typo before the build silently falls back to no image
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

export async function validateImages(
	entries: Array<ContentEntry>,
	mediaPath: string,
): Promise<ValidationResult> {
	const mediaFiles = await collectMediaFiles(mediaPath);

	// Originals are gitignored, so an empty tree is a missing checkout rather than a content fault
	if (mediaFiles.size === 0) {
		return { issues: [], status: 'warn', summary: `No image files found in ${mediaPath}` };
	}

	const issues = collectMissingImageIssues(entries, mediaFiles);

	return toValidationResult(
		issues.map(({ imagePath, location }) => ({
			location,
			message: `no image file at "${imagePath}"`,
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

// `_`-prefixed folders hold unused originals, such as `media/_unused`
async function collectMediaFiles(mediaPath: string) {
	const sources = await listImageSources(mediaPath);

	return new Set(
		[...sources].filter((source) => source.split('/').every((segment) => !segment.startsWith('_'))),
	);
}
