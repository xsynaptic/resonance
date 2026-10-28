import {
	getCollectionEntries,
	log,
	withAstroContent,
	withSpinner,
	withStep,
} from '@xsynaptic/astro-scripts';
import { sitemapLastmodPath } from '@xsynaptic/shared/constants';
import { getContentPath } from '@xsynaptic/shared/routing';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { contentDataPath } from '#shared/content-path.ts';
import { getGitFileDates } from '#sitemap-lastmod/git-file-dates.ts';

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

interface SitemapLastmodOptions {
	rootPath: string;
	siteUrl: string;
}

export async function generateSitemapLastmod(options: SitemapLastmodOptions): Promise<void> {
	await withStep('Sitemap lastmod', () => writeSitemapLastmod(options));
}

async function writeSitemapLastmod(options: SitemapLastmodOptions): Promise<void> {
	const outputPath = path.resolve(options.rootPath, sitemapLastmodPath);

	const gitDates = await withSpinner('Reading git log', () =>
		getGitFileDates({
			cwd: path.resolve(options.rootPath, contentDataPath),
			keyPrefix: contentDataPath,
			pathspec: 'collections/',
		}),
	);

	const entries = await withSpinner('Loading content', () =>
		withAstroContent((content) => getCollectionEntries(content, [...datedCollections])),
	);

	const contentPathPrefix = `${contentDataPath}/collections/`;
	const urls: Record<string, string> = {};

	let resolvedCount = 0;
	let missingDateCount = 0;

	for (const entry of entries) {
		if (!entry.filePath?.startsWith(contentPathPrefix)) continue;

		const gitDate = gitDates.get(entry.filePath);

		// Normally a file added but never committed, which is exactly what a deploy should surface
		if (!gitDate) {
			missingDateCount++;
			log.warn(`No git history: ${entry.filePath}`);
			continue;
		}

		urls[new URL(getContentPath(entry.collection, entry.id), options.siteUrl).href] = gitDate;
		resolvedCount++;
	}

	mkdirSync(path.dirname(outputPath), { recursive: true });

	writeFileSync(
		outputPath,
		JSON.stringify({ generatedAt: new Date().toISOString(), urls }, undefined, 2),
	);

	log.success(`Resolved ${String(resolvedCount)} URLs to ${outputPath}`);

	if (missingDateCount > 0) {
		log.warn(`${String(missingDateCount)} entries with no matching git history`);
	}
}
