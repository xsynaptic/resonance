#!/usr/bin/env tsx
import chalk from 'chalk';
import path from 'node:path';

import type { ValidationResult } from './validation-result.js';

import { getCollectionEntries, withAstroContent } from '../shared/astro-content.js';
import { findWorkspaceRoot } from '../shared/utils.js';
import { validateBodyMarkers } from './body-markers.js';
import { validateDownloadsLegacy } from './downloads-legacy.js';
import { validateEntryIds } from './entry-ids.js';
import { validateImages } from './images.js';
import { validateLinkIds } from './link-ids.js';
import { validateReferences } from './references.js';
import { validateRefs } from './refs.js';
import { validateReviewFolders } from './review-folders.js';
import { validateSeriesItems } from './series-items.js';
import { validateTrackTimestamps } from './track-timestamps.js';
import { reportValidationResult } from './validation-result.js';

// `downloads` is excluded; it is generated from JSON and carries none of the fields these read
const contentCollections = [
	'artists',
	'eras',
	'formats',
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

// Mirrors `linkableCollections` in references-data.ts; the two have to stay in step
const linkableCollections = [
	'artists',
	'labels',
	'styles',
	'regions',
	'eras',
	'series',
	'formats',
	'themes',
];

// Mirrors seriesMemberCollections in term-index.ts
const seriesMemberCollections = ['mixes', 'reviews', 'posts'];

// The only collections `audioFields` is spread into, so the only ones that can carry `tracks`
const audioCollections = ['mixes', 'reviews'];

// The two collections `selectionFields` is spread into, plus the two that can carry `tracks`
const markerCollections = ['mixes', 'pages', 'posts', 'reviews'];

// Frontmatter media paths are relative to this directory; mirrors `mediaRoot` in lib/utils/media.ts
const mediaPath = 'packages/content/_media';

const rootPath = findWorkspaceRoot();

const allEntries = await withAstroContent((content) =>
	getCollectionEntries(content, [...contentCollections]),
);

function entriesFrom(...collections: Array<string>) {
	return allEntries.filter((entry) => collections.includes(entry.collection));
}

// Keys double as the CLI subcommand names
const validations = {
	'body-markers': () => validateBodyMarkers(entriesFrom(...markerCollections)),
	'downloads-legacy': () => validateDownloadsLegacy(entriesFrom('mixes')),
	'entry-ids': () => validateEntryIds(allEntries),
	images: () => validateImages(allEntries, path.resolve(rootPath, mediaPath)),
	'link-ids': () => validateLinkIds(allEntries, entriesFrom(...linkableCollections)),
	references: () => validateReferences(allEntries),
	refs: () => validateRefs(allEntries, entriesFrom('artists', 'labels')),
	'review-folders': () => validateReviewFolders(entriesFrom('reviews')),
	'series-items': () =>
		validateSeriesItems(entriesFrom('series'), entriesFrom(...seriesMemberCollections)),
	'track-timestamps': () => validateTrackTimestamps(entriesFrom(...audioCollections)),
} satisfies Record<string, () => ValidationResult>;

const command = process.argv[2];

const selected = command
	? Object.entries(validations).filter(([name]) => name === command)
	: Object.entries(validations);

if (command && selected.length === 0) {
	console.log(chalk.red(`Unknown command: ${command}`));
	console.log(chalk.dim(`Available: ${Object.keys(validations).join(', ')}`));
	process.exit(1);
}

let hasFailure = false;

for (const [, validate] of selected) {
	const result = validate();

	reportValidationResult(result);

	if (result.status === 'fail') hasFailure = true;
}

// A subcommand is for inspection, so only a full run exits non-zero
if (!command && hasFailure) process.exit(1);
