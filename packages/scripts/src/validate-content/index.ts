#!/usr/bin/env node
import {
	checkComponentProps,
	checkComponentTargets,
	checkEntryIds,
	checkReferences,
	getCollectionEntries,
	runValidations,
	withAstroContent,
	withSpinner,
} from '@xsynaptic/astro-scripts';
import { readFileSync } from 'node:fs';
import path from 'node:path';

import type { PlatformKeys } from '#validate-content/platform-links.ts';

import { mixcloudStatsPath } from '#platform-stats/mixcloud-stats.ts';
import { readGenerationKeys } from '#platform-stats/platform-stats-file.ts';
import { soundcloudStatsPath } from '#platform-stats/soundcloud-stats.ts';
import { runCommand } from '#shared/command.ts';
import { contentDataPath } from '#shared/content-path.ts';
import { validateBodyMarkers } from '#validate-content/body-markers.ts';
import { validateCreditNearMisses } from '#validate-content/credit-near-misses.ts';
import { validateCredits } from '#validate-content/credits.ts';
import { validateDownloadsLegacy } from '#validate-content/downloads-legacy.ts';
import { validateImages } from '#validate-content/images.ts';
import { validatePlatformLinks } from '#validate-content/platform-links.ts';
import { validatePlaylistItems } from '#validate-content/playlist-items.ts';
import { validateReviewFolders } from '#validate-content/review-folders.ts';
import { validateSelectionEntryIds } from '#validate-content/selection-entry-ids.ts';
import { validateSeriesItems } from '#validate-content/series-items.ts';
import { validateTrackGroups } from '#validate-content/track-groups.ts';
import { validateTrackTimestamps } from '#validate-content/track-timestamps.ts';

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

// The two collections `selectionFields` is spread into
const selectionCollections = ['pages', 'posts'];

// Mirrors linkableCollections in src/lib/utils/entries.ts
const linkableCollections = ['mixes', 'reviews', 'posts'];

// The two collections `selectionFields` is spread into, plus the two that can carry `tracks`
const markerCollections = ['mixes', 'pages', 'posts', 'reviews'];

// Frontmatter media paths are relative to this directory; mirrors `mediaRoot` in lib/utils/media.ts
const mediaPath = `${contentDataPath}/media`;

// Mirrors playlistsDataPath in src/constants.ts
const playlistsPath = `${contentDataPath}/data/playlists.yaml`;

// Names are the CLI subcommands; a full run reports in this order
const checkNames = [
	'body-markers',
	'credit-near-misses',
	'credits',
	'downloads-legacy',
	'entry-ids',
	'images',
	'link-ids',
	'mdx',
	'platform-links',
	'playlist-items',
	'references',
	'review-folders',
	'selection-entry-ids',
	'series-items',
	'track-groups',
	'track-timestamps',
] as const;

type ContentEntries = Awaited<ReturnType<typeof loadEntries>>;

async function loadEntries() {
	return withAstroContent((content) => getCollectionEntries(content, [...contentCollections]));
}

// Read once rather than per check; an absent file leaves its keys `undefined` and is skipped
async function readPlatformKeys(rootPath: string): Promise<PlatformKeys> {
	return {
		mixcloud: await readGenerationKeys(path.resolve(rootPath, mixcloudStatsPath)),
		soundcloud: await readGenerationKeys(path.resolve(rootPath, soundcloudStatsPath)),
	};
}

function getChecks(
	allEntries: ContentEntries,
	{ platformKeys, rootPath }: { platformKeys: PlatformKeys; rootPath: string },
) {
	function entriesFrom(...collections: Array<string>) {
		return allEntries.filter((entry) => collections.includes(entry.collection));
	}

	return {
		'body-markers': () => validateBodyMarkers(entriesFrom(...markerCollections)),
		'credit-near-misses': () =>
			validateCreditNearMisses(allEntries, entriesFrom('artists', 'labels')),
		credits: () => validateCredits(allEntries, entriesFrom('artists', 'labels')),
		'downloads-legacy': () => validateDownloadsLegacy(entriesFrom('mixes')),
		'entry-ids': () => checkEntryIds(allEntries),
		images: () => validateImages(allEntries, path.resolve(rootPath, mediaPath)),
		'link-ids': () =>
			checkComponentTargets(allEntries, {
				component: 'Link',
				label: 'Link ID',
				prop: 'id',
				rootPath,
				targets: allEntries.map((entry) => entry.id),
			}),
		mdx: () =>
			checkComponentProps(allEntries, {
				required: { Img: 'src', Link: 'id', Quotation: 'author' },
				rootPath,
			}),
		'platform-links': () => validatePlatformLinks(entriesFrom('mixes'), platformKeys),
		'playlist-items': () =>
			validatePlaylistItems(
				readFileSync(path.resolve(rootPath, playlistsPath), 'utf8'),
				playlistsPath,
				entriesFrom('mixes'),
			),
		references: () => checkReferences(allEntries),
		'review-folders': () => validateReviewFolders(entriesFrom('reviews')),
		'selection-entry-ids': () =>
			validateSelectionEntryIds(
				entriesFrom(...selectionCollections),
				new Set(entriesFrom(...linkableCollections).map((entry) => entry.id)),
			),
		'series-items': () =>
			validateSeriesItems(entriesFrom('series'), entriesFrom(...seriesMemberCollections)),
		'track-groups': () => validateTrackGroups(entriesFrom('mixes')),
		'track-timestamps': () => validateTrackTimestamps(entriesFrom(...audioCollections)),
	};
}

await runCommand({
	name: 'validate-content',
	positional: {
		choices: checkNames,
		description: 'Run one check by name; omit to run all',
		name: 'check',
	},
	async run({ positionals, rootPath }) {
		const [only] = positionals;
		const allEntries = await withSpinner('Loading content', loadEntries);
		const checks = getChecks(allEntries, {
			platformKeys: await readPlatformKeys(rootPath),
			rootPath,
		});

		await runValidations(checkNames, checks, { only });
	},
	summary: 'Check references, credits, tracklists, links and media before a build',
	title: 'Validate content',
});
