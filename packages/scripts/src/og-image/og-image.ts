import {
	openGraphBasePath,
	openGraphImageFormat,
	openGraphOutputPath,
} from '@xsynaptic/shared/constants';
import chalk from 'chalk';
import { promises as fs, rmSync } from 'node:fs';
import path from 'node:path';
import pLimit from 'p-limit';

import type { FontsourceConfig } from './fonts.js';
import type { OpenGraphEntry } from './types.js';

import { getBuiltEntries } from './built-entries.js';
import { fontsourceFonts } from './fonts.js';
import { createRenderer, processCover } from './generate.js';
import { createOutputCache, getCacheKey } from './output-cache.js';

// Matches the Astro font config; the site pulls the same faces through fontProviders.fontsource()
const fontConfigs: Array<FontsourceConfig> = [
	{
		name: 'Fira Sans',
		package: 'fira-sans',
		variants: [{ style: 'normal', subset: 'latin', weight: 700 }],
	},
	{
		name: 'Manrope',
		package: 'manrope',
		variants: [{ style: 'normal', subset: 'latin', weight: 600 }],
	},
];

// Rendering is CPU-bound and each entry decodes its own cover, so one bound covers both
const concurrency = 12;

// Frontmatter cover paths are relative to this, matching `src/lib/utils/media.ts`
const mediaRoot = 'packages/content/_media';

interface OpenGraphOptions {
	clearCache?: boolean;
	distPath?: string;
	rootPath: string;
}

export async function generateOpenGraphImages(options: OpenGraphOptions): Promise<void> {
	const { clearCache = false, distPath = './dist', rootPath } = options;

	const outputPath = path.resolve(rootPath, openGraphOutputPath);
	const mediaPath = path.resolve(rootPath, mediaRoot);

	console.log(chalk.blue('Generating Open Graph images...'));

	if (clearCache) {
		rmSync(outputPath, { force: true, recursive: true });
		console.log(chalk.yellow(`  Cleared ${outputPath}`));
		return;
	}

	const { entries, unresolved } = await getBuiltEntries({
		distPath: path.resolve(rootPath, distPath),
	});

	reportUnresolved(unresolved);

	const fonts = await fontsourceFonts(fontConfigs);

	await fs.mkdir(outputPath, { recursive: true });

	const cache = await createOutputCache(outputPath);
	const renderCard = createRenderer(fonts);
	const limit = pLimit(concurrency);

	let generatedCount = 0;
	let missingCoverCount = 0;
	let skippedCount = 0;
	const errors: Array<string> = [];

	async function getCoverModifiedTime(imageFeaturedId: string): Promise<number | undefined> {
		try {
			const stats = await fs.stat(path.join(mediaPath, imageFeaturedId));

			return stats.mtimeMs;
		} catch {
			return undefined;
		}
	}

	async function renderEntry(entry: OpenGraphEntry): Promise<void> {
		const { imageFeaturedId } = entry;

		const coverModifiedTime = imageFeaturedId
			? await getCoverModifiedTime(imageFeaturedId)
			: undefined;

		const key = getCacheKey({ coverModifiedTime, digest: entry.digest, imageFeaturedId });

		if (cache.isFresh(entry.outputId, key)) {
			skippedCount++;
			return;
		}

		// Originals are gitignored and may be absent; a card without its art still beats no card
		if (imageFeaturedId && coverModifiedTime === undefined) {
			console.log(chalk.yellow(`  Cover missing: ${imageFeaturedId} (${entry.outputId})`));
			missingCoverCount++;
		}

		const cover =
			imageFeaturedId && coverModifiedTime !== undefined
				? await processCover(path.join(mediaPath, imageFeaturedId))
				: undefined;

		await cache.write(entry.outputId, key, await renderCard(entry, cover));

		generatedCount++;
	}

	await Promise.all(
		entries.map((entry) =>
			limit(async () => {
				try {
					await renderEntry(entry);
				} catch (error) {
					errors.push(
						`${entry.outputId}: ${error instanceof Error ? error.message : String(error)}`,
					);
				}
			}),
		),
	);

	await cache.save();

	console.log(
		chalk.gray(`  ${String(generatedCount)} generated, ${String(skippedCount)} cached`) +
			(missingCoverCount > 0 ? chalk.yellow(`, ${String(missingCoverCount)} without cover`) : ''),
	);

	for (const error of errors) {
		console.log(chalk.red(`  ✗ ${error}`));
	}

	if (errors.length > 0) {
		throw new Error(`${String(errors.length)} Open Graph image(s) failed to render`);
	}

	await publish({
		cache,
		distPath: path.resolve(rootPath, distPath),
		outputIds: entries.map((entry) => entry.outputId),
	});
}

/**
 * Copy the current set into the build output. Cards for entries that no longer exist stay behind in
 * the cache and are not published: giving them a durable home is backlogged, see
 * `.claude/tasks-backlog/00-backlog.md` under "Durable home for OG images".
 */
async function publish({
	cache,
	distPath,
	outputIds,
}: {
	cache: { filePath: (id: string) => string };
	distPath: string;
	outputIds: Array<string>;
}): Promise<void> {
	const publishPath = path.join(distPath, openGraphBasePath);

	await fs.mkdir(publishPath, { recursive: true });

	for (const outputId of outputIds) {
		await fs.copyFile(
			cache.filePath(outputId),
			path.join(publishPath, `${outputId}.${openGraphImageFormat}`),
		);
	}

	console.log(chalk.gray(`  Published ${String(outputIds.length)} cards to ${publishPath}`));
}

// A page asking for a card nothing can draw would ship with a broken og:image
function reportUnresolved(unresolved: Array<string>): void {
	if (unresolved.length === 0) return;

	for (const outputId of unresolved) {
		console.log(chalk.red(`  ✗ Unresolved: ${outputId}`));
	}

	throw new Error(
		`${String(unresolved.length)} card(s) referenced by the build resolve to no entry`,
	);
}
