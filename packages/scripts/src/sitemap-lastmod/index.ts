import { sitemapLastmodPath } from '@xsynaptic/shared/constants';
import { getContentPath } from '@xsynaptic/shared/routing';
import chalk from 'chalk';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { getCollectionEntries, withAstroContent } from '#shared/astro-content.ts';
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
	contentPath?: string;
	outputPath?: string;
	rootPath: string;
	siteUrl: string;
}

export async function generateSitemapLastmod(options: SitemapLastmodOptions): Promise<void> {
	console.log(chalk.magenta('=== Sitemap lastmod ==='));

	const { contentPathAbs, contentPathRelative, outputPath } = resolvePaths(options);

	console.log(chalk.blue('Reading git log...'));

	const gitDates = await getGitFileDates({
		cwd: contentPathAbs,
		keyPrefix: contentPathRelative,
		pathspec: 'collections/',
	});

	console.log(chalk.blue('Loading content...'));

	const entries = await withAstroContent((content) =>
		getCollectionEntries(content, [...datedCollections]),
	);

	const contentPathPrefix = `${contentPathRelative}/collections/`;
	const urls: Record<string, string> = {};

	let resolvedCount = 0;
	let missingDateCount = 0;

	for (const entry of entries) {
		if (!entry.filePath?.startsWith(contentPathPrefix)) continue;

		const gitDate = gitDates.get(entry.filePath);

		// Normally a file added but never committed, which is exactly what a deploy should surface
		if (!gitDate) {
			missingDateCount++;
			console.log(chalk.yellow(`  No git history: ${entry.filePath}`));
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

	console.log(chalk.green(`Resolved: ${String(resolvedCount)} URLs`));

	if (missingDateCount > 0) {
		console.log(chalk.yellow(`  ${String(missingDateCount)} entries with no matching git history`));
	}

	console.log(chalk.gray(`Output: ${outputPath}`));
}

function resolvePaths(options: SitemapLastmodOptions) {
	const contentPathRelative = options.contentPath ?? contentDataPath;

	return {
		contentPathAbs: path.resolve(options.rootPath, contentPathRelative),
		contentPathRelative,
		outputPath: path.resolve(options.rootPath, options.outputPath ?? sitemapLastmodPath),
	};
}
