import type { SitemapLastmodPair } from '@xsynaptic/astro-sitemap-lastmod/write';

import {
	getCollectionEntries,
	getEntryCommitDates,
	log,
	withAstroContent,
	withSpinner,
	withStep,
} from '@xsynaptic/astro-scripts';
import { createSitemapLastmodWriter } from '@xsynaptic/astro-sitemap-lastmod/write';
import { sitemapLastmodPath } from '@xsynaptic/shared/constants';
import { getContentPath } from '@xsynaptic/shared/routing';
import path from 'node:path';

import { contentDataPath } from '#shared/content-path.ts';

// Collections such as `comments` and `downloads` are generated, carrying no file to date
const datedCollections = [
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

export async function generateSitemapLastmod(rootPath: string): Promise<void> {
	await withStep('Sitemap lastmod', () => writeSitemapLastmod(rootPath));
}

async function writeSitemapLastmod(rootPath: string): Promise<void> {
	const outputPath = path.resolve(rootPath, sitemapLastmodPath);

	const entries = await withSpinner('Loading content', () =>
		withAstroContent((content) => getCollectionEntries(content, [...datedCollections])),
	);

	const contentPathPrefix = `${contentDataPath}/collections/`;
	const datedEntries = entries.filter((entry) => entry.filePath?.startsWith(contentPathPrefix));
	const gitDates = await withSpinner('Reading git log', () =>
		getEntryCommitDates(datedEntries, { rootPath }),
	);
	const pairs: Array<SitemapLastmodPair> = [];

	let missingDateCount = 0;

	for (const entry of datedEntries) {
		const gitDate = entry.filePath ? gitDates.get(entry.filePath) : undefined;

		// Normally a file added but never committed, which is exactly what a deploy should surface
		if (!gitDate) {
			missingDateCount++;
			log.warn(`No git history: ${entry.filePath ?? entry.id}`);
			continue;
		}

		pairs.push([getContentPath(entry.collection, entry.id), gitDate]);
	}

	const resolvedCount = createSitemapLastmodWriter({ filePath: outputPath }).record(pairs);

	log.success(`Resolved ${String(resolvedCount)} URLs to ${outputPath}`);

	if (missingDateCount > 0) {
		log.warn(`${String(missingDateCount)} entries with no matching git history`);
	}
}
