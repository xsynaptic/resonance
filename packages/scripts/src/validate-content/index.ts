#!/usr/bin/env tsx
import { ASTRO_CACHE_DIR } from '@xsynaptic/shared/constants';
import chalk from 'chalk';
import path from 'node:path';

import type { ValidationResult } from './validation-result.js';

import { getDataStoreCollection, loadDataStore } from '../shared/data-store.js';
import { findWorkspaceRoot } from '../shared/utils.js';
import { validateEntryIds } from './entry-ids.js';
import { validateLinkIds } from './link-ids.js';
import { validateReferences } from './references.js';
import { validateRefs } from './refs.js';
import { validateSeriesItems } from './series-items.js';
import { validateTrackTimestamps } from './track-timestamps.js';
import { reportValidationResult } from './validation-result.js';

// `downloads` is excluded; it is generated from JSON and carries none of the fields these read
const CONTENT_COLLECTIONS = [
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
];

// Mirrors `linkableCollections` in references-data.ts; the two have to stay in step
const LINKABLE_COLLECTIONS = [
	'artists',
	'labels',
	'styles',
	'regions',
	'eras',
	'series',
	'formats',
	'themes',
];

// Mirrors SERIES_MEMBER_COLLECTIONS in term-index.ts
const SERIES_MEMBER_COLLECTIONS = ['mixes', 'reviews', 'posts'];

// The only collections `audioFields` is spread into, so the only ones that can carry `tracks`
const AUDIO_COLLECTIONS = ['mixes', 'reviews'];

const rootPath = findWorkspaceRoot();

const collections = loadDataStore(path.resolve(rootPath, ASTRO_CACHE_DIR, 'data-store.json'));

const allEntries = getDataStoreCollection(collections, CONTENT_COLLECTIONS);

// Keys double as the CLI subcommand names
const validations = {
	'entry-ids': () => validateEntryIds(allEntries),
	'link-ids': () =>
		validateLinkIds(allEntries, getDataStoreCollection(collections, LINKABLE_COLLECTIONS)),
	references: () => validateReferences(collections, CONTENT_COLLECTIONS),
	refs: () => validateRefs(allEntries, collections),
	'series-items': () =>
		validateSeriesItems(
			getDataStoreCollection(collections, ['series']),
			getDataStoreCollection(collections, SERIES_MEMBER_COLLECTIONS),
		),
	'track-timestamps': () =>
		validateTrackTimestamps(getDataStoreCollection(collections, AUDIO_COLLECTIONS)),
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
