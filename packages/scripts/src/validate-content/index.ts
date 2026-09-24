#!/usr/bin/env tsx
import chalk from 'chalk';
import path from 'node:path';

import type { ValidationResult } from '#validate-content/validation-result.ts';

import { mixcloudStatsPath } from '#platform-stats/mixcloud-stats.ts';
import { readGenerationKeys } from '#platform-stats/platform-stats-file.ts';
import { soundcloudStatsPath } from '#platform-stats/soundcloud-stats.ts';
import { getCollectionEntries, withAstroContent } from '#shared/astro-content.ts';
import { contentDataPath } from '#shared/content-path.ts';
import { findWorkspaceRoot } from '#shared/utils.ts';
import { validateBodyMarkers } from '#validate-content/body-markers.ts';
import { validateCredits } from '#validate-content/credits.ts';
import { validateDownloadsLegacy } from '#validate-content/downloads-legacy.ts';
import { validateEntryIds } from '#validate-content/entry-ids.ts';
import { validateImages } from '#validate-content/images.ts';
import { validateLinkIds } from '#validate-content/link-ids.ts';
import { validateMdxComponents } from '#validate-content/mdx.ts';
import { validatePlatformLinks } from '#validate-content/platform-links.ts';
import { validateReferences } from '#validate-content/references.ts';
import { validateReviewFolders } from '#validate-content/review-folders.ts';
import { validateSeriesItems } from '#validate-content/series-items.ts';
import { validateTrackGroups } from '#validate-content/track-groups.ts';
import { validateTrackTimestamps } from '#validate-content/track-timestamps.ts';
import { reportValidationResult } from '#validate-content/validation-result.ts';

// `downloads` is excluded; it is generated from JSON and carries none of the fields these read
const contentCollections = [
	'artists',
	'eras',
	'labels',
	'mixes',
	'pages',
	'posts',
	'regions',
	'reviews',
	'series',
	'styles',
	'themes',
] as const;

// Mirrors seriesMemberCollections in term-index.ts
const seriesMemberCollections = ['mixes', 'reviews', 'posts'];

// The only collections `audioFields` is spread into, so the only ones that can carry `tracks`
const audioCollections = ['mixes', 'reviews'];

// The two collections `selectionFields` is spread into, plus the two that can carry `tracks`
const markerCollections = ['mixes', 'pages', 'posts', 'reviews'];

// Frontmatter media paths are relative to this directory; mirrors `mediaRoot` in lib/utils/media.ts
const mediaPath = `${contentDataPath}/media`;

const rootPath = findWorkspaceRoot();

const allEntries = await withAstroContent((content) =>
	getCollectionEntries(content, [...contentCollections]),
);

function entriesFrom(...collections: Array<string>) {
	return allEntries.filter((entry) => collections.includes(entry.collection));
}

// Read once here rather than per check; an absent file leaves its keys `undefined` and is skipped
const platformKeys = {
	mixcloud: await readGenerationKeys(path.resolve(rootPath, mixcloudStatsPath)),
	soundcloud: await readGenerationKeys(path.resolve(rootPath, soundcloudStatsPath)),
};

// Names are the CLI subcommands; a full run reports in this order
const validations = [
	{ name: 'body-markers', run: () => validateBodyMarkers(entriesFrom(...markerCollections)) },
	{ name: 'credits', run: () => validateCredits(allEntries, entriesFrom('artists', 'labels')) },
	{ name: 'downloads-legacy', run: () => validateDownloadsLegacy(entriesFrom('mixes')) },
	{ name: 'entry-ids', run: () => validateEntryIds(allEntries) },
	{
		name: 'images',
		run: () => validateImages(allEntries, path.resolve(rootPath, mediaPath)),
	},
	{ name: 'link-ids', run: () => validateLinkIds(allEntries, allEntries, rootPath) },
	{ name: 'mdx', run: () => validateMdxComponents(allEntries, rootPath) },
	{ name: 'platform-links', run: () => validatePlatformLinks(entriesFrom('mixes'), platformKeys) },
	{ name: 'references', run: () => validateReferences(allEntries) },
	{ name: 'review-folders', run: () => validateReviewFolders(entriesFrom('reviews')) },
	{
		name: 'series-items',
		run: () => validateSeriesItems(entriesFrom('series'), entriesFrom(...seriesMemberCollections)),
	},
	{ name: 'track-groups', run: () => validateTrackGroups(entriesFrom('mixes')) },
	{
		name: 'track-timestamps',
		run: () => validateTrackTimestamps(entriesFrom(...audioCollections)),
	},
] satisfies Array<{ name: string; run: () => ValidationResult }>;

const command = process.argv[2];

const selected = command ? validations.filter(({ name }) => name === command) : validations;

if (command && selected.length === 0) {
	console.log(chalk.red(`Unknown command: ${command}`));
	console.log(chalk.dim(`Available: ${validations.map(({ name }) => name).join(', ')}`));
	process.exit(1);
}

let hasFailure = false;

for (const { run } of selected) {
	const result = run();

	reportValidationResult(result);

	if (result.status === 'fail') hasFailure = true;
}

// A subcommand is for inspection, so only a full run exits non-zero
if (!command && hasFailure) process.exit(1);
