import { astroCacheDir, sitemapLastmodPath } from '@xsynaptic/shared/constants';
import { getContentUrl } from '@xsynaptic/shared/routing';
import chalk from 'chalk';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import type { DataStoreCollections } from '../shared/data-store.js';

import { loadDataStore } from '../shared/data-store.js';
import { getGitFileDates } from './git-file-dates.js';

interface ContentEntry {
	collection: string;
	filePath: string;
	id: string;
}

interface SitemapLastmodOptions {
	contentPath?: string;
	outputPath?: string;
	rootPath: string;
	siteUrl: string;
}

export async function generateSitemapLastmod(options: SitemapLastmodOptions): Promise<void> {
	console.log(chalk.magenta('=== Sitemap lastmod ==='));

	const { contentPathAbs, contentPathRelative, dataStorePath, outputPath } = resolvePaths(options);

	console.log(chalk.blue('Reading git log...'));

	const gitDates = await getGitFileDates({
		cwd: contentPathAbs,
		keyPrefix: contentPathRelative,
		pathspec: 'collections/',
	});

	console.log(chalk.blue('Loading data store...'));

	const collections = loadDataStore(dataStorePath);

	const urls: Record<string, string> = {};

	let resolvedCount = 0;
	let missingDateCount = 0;

	for (const { collection, filePath, id } of collectContentEntries(
		collections,
		`${contentPathRelative}/collections/`,
	)) {
		const gitDate = gitDates.get(filePath);

		// Normally a file added but never committed, which is exactly what a deploy should surface
		if (!gitDate) {
			missingDateCount++;
			console.log(chalk.yellow(`  No git history: ${filePath}`));
			continue;
		}

		urls[new URL(getContentUrl(collection, id), options.siteUrl).href] = gitDate;
		resolvedCount++;
	}

	mkdirSync(path.dirname(outputPath), { recursive: true });

	writeFileSync(
		outputPath,
		JSON.stringify({ generatedAt: new Date().toISOString(), urls }, undefined, 2),
	);

	console.log(chalk.green(`Resolved: ${String(resolvedCount)} URLs`));

	if (missingDateCount > 0) {
		console.log(chalk.yellow(`  ${String(missingDateCount)} entries with no matching git history`));
	}

	console.log(chalk.gray(`Output: ${outputPath}`));
}

// Collections such as `comments` and `downloads` are generated, carrying no file to date
function collectContentEntries(
	collections: DataStoreCollections,
	contentPathPrefix: string,
): Array<ContentEntry> {
	const entries: Array<ContentEntry> = [];

	for (const [collection, collectionEntries] of collections) {
		for (const entry of collectionEntries.values()) {
			if (entry.filePath?.startsWith(contentPathPrefix)) {
				entries.push({ collection, filePath: entry.filePath, id: entry.id });
			}
		}
	}

	return entries;
}

function resolvePaths(options: SitemapLastmodOptions) {
	const contentPathRelative = options.contentPath ?? 'packages/content';

	return {
		contentPathAbs: path.resolve(options.rootPath, contentPathRelative),
		contentPathRelative,
		dataStorePath: path.resolve(options.rootPath, astroCacheDir, 'data-store.json'),
		outputPath: path.resolve(options.rootPath, options.outputPath ?? sitemapLastmodPath),
	};
}
