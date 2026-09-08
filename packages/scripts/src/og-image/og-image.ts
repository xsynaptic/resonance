import {
	openGraphBasePath,
	openGraphImageFormat,
	openGraphOutputPath,
} from '@xsynaptic/shared/constants';
import chalk from 'chalk';
import { promises as fs, rmSync } from 'node:fs';
import path from 'node:path';
import pLimit from 'p-limit';

import type { OpenGraphEntry } from '#og-image/types.ts';

import { getBuiltEntries } from '#og-image/built-entries.ts';
import { createCardRenderer, resolveFeaturedImagePath } from '#og-image/generate.ts';
import { createOutputCache, getCacheKey } from '#og-image/output-cache.ts';

// Rendering is CPU-bound and each entry decodes its own image, so one bound serves both
const concurrency = 12;

interface OpenGraphOptions {
	clearCache?: boolean;
	distPath?: string;
	rootPath: string;
}

export async function generateOpenGraphImages(options: OpenGraphOptions): Promise<void> {
	const { clearCache = false, distPath = './dist', rootPath } = options;

	const outputPath = path.resolve(rootPath, openGraphOutputPath);

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

	await fs.mkdir(outputPath, { recursive: true });

	const cache = await createOutputCache(outputPath);
	const renderCard = await createCardRenderer();
	const limit = pLimit(concurrency);

	let generatedCount = 0;
	let missingImageCount = 0;
	let skippedCount = 0;
	const errors: Array<string> = [];

	async function getImageModifiedTime(imageFeaturedId: string): Promise<number | undefined> {
		try {
			const stats = await fs.stat(resolveFeaturedImagePath(imageFeaturedId));

			return stats.mtimeMs;
		} catch {
			return undefined;
		}
	}

	async function renderEntry(entry: OpenGraphEntry): Promise<void> {
		const { imageFeaturedId } = entry;

		const imageModifiedTime = imageFeaturedId
			? await getImageModifiedTime(imageFeaturedId)
			: undefined;

		const key = getCacheKey({
			digest: entry.digest,
			imageFeaturedId,
			imageModifiedTime,
			style: entry.style,
		});

		if (cache.isFresh(entry.outputId, key)) {
			skippedCount++;
			return;
		}

		// Originals are gitignored and may be absent; a card without its art still beats no card
		if (imageFeaturedId && imageModifiedTime === undefined) {
			console.log(chalk.yellow(`  Featured Image missing: ${imageFeaturedId} (${entry.outputId})`));
			missingImageCount++;
		}

		await cache.write(entry.outputId, key, await renderCard(entry));

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
			(missingImageCount > 0
				? chalk.yellow(`, ${String(missingImageCount)} without a Featured Image`)
				: ''),
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

// Orphans stay in the cache unpublished; a renamed entry's old URL is carried by a redirect rule
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
