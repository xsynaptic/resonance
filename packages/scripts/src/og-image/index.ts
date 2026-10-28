import type { Progress } from '@xsynaptic/astro-scripts';

import { createProgress, log, UserError, withStep } from '@xsynaptic/astro-scripts';
import {
	openGraphBasePath,
	openGraphImageFormat,
	openGraphOutputPath,
} from '@xsynaptic/shared/constants';
import { promises as fs, rmSync } from 'node:fs';
import path from 'node:path';
import pLimit from 'p-limit';

import type { OpenGraphEntry } from '#og-image/types.ts';

import { getBuiltEntries } from '#og-image/built-entries.ts';
import { createCardRenderer, resolveFeaturedImagePath } from '#og-image/generate.ts';
import { createOutputCache, getCacheKey } from '#og-image/output-cache.ts';

const concurrency = 12;

interface CardCache {
	isFresh: (id: string, key: string) => boolean;
	write: (id: string, key: string, data: Uint8Array) => Promise<void>;
}

// What one card's turn through the renderer came to; tallied once the run is over
type CardOutcome =
	| { hasMissingImage: boolean; status: 'drawn' }
	| { reason: string; status: 'failed' }
	| { status: 'cached' };

interface OpenGraphOptions {
	clearCache?: boolean;
	distPath?: string;
	rootPath: string;
}

export async function generateOpenGraphImages(options: OpenGraphOptions): Promise<void> {
	await withStep('Generating Open Graph images', () => drawOpenGraphImages(options));
}

async function drawOpenGraphImages(options: OpenGraphOptions): Promise<void> {
	const { clearCache = false, distPath = './dist', rootPath } = options;

	const outputPath = path.resolve(rootPath, openGraphOutputPath);

	if (clearCache) {
		rmSync(outputPath, { force: true, recursive: true });
		log.success(`Cleared ${outputPath}`);
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
	const progress = createProgress({ label: 'Cards', total: entries.length });

	const outcomes = await Promise.all(
		entries.map((entry) =>
			limit(async () => {
				const outcome = await renderEntry({ cache, entry, renderCard });

				progress.tick();

				return outcome;
			}),
		),
	);

	const prunedCount = await cache.prune(new Set(entries.map((entry) => entry.outputId)));

	await cache.save();

	if (prunedCount > 0) {
		log.detail(`Pruned ${String(prunedCount)} orphaned card(s)`);
	}

	reportOutcomes(outcomes, progress);

	await publish({
		cache,
		distPath: path.resolve(rootPath, distPath),
		outputIds: entries.map((entry) => entry.outputId),
	});
}

// Only cards the build asks for publish; a renamed entry's old card URL is carried by a redirect rule
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

	log.success(`Published ${String(outputIds.length)} cards to ${publishPath}`);
}

async function readImageModifiedTime(imageFeaturedId: string): Promise<number | undefined> {
	try {
		const stats = await fs.stat(resolveFeaturedImagePath(imageFeaturedId));

		return stats.mtimeMs;
	} catch {
		return undefined;
	}
}

// One card cannot fail the whole run on its own; the tally decides whether the build stops
async function renderEntry({
	cache,
	entry,
	renderCard,
}: {
	cache: CardCache;
	entry: OpenGraphEntry;
	renderCard: (entry: OpenGraphEntry) => Promise<Uint8Array>;
}): Promise<CardOutcome> {
	const { imageFeaturedId } = entry;

	try {
		const imageModifiedTime = imageFeaturedId
			? await readImageModifiedTime(imageFeaturedId)
			: undefined;

		const key = getCacheKey({
			digest: entry.digest,
			imageFeaturedId,
			imageModifiedTime,
			style: entry.style,
		});

		if (cache.isFresh(entry.outputId, key)) return { status: 'cached' };

		const missingImageId =
			imageFeaturedId && imageModifiedTime === undefined ? imageFeaturedId : undefined;

		// Originals are gitignored and may be absent; a card without its art still beats no card
		if (missingImageId !== undefined) {
			log.warn(`Featured Image missing: ${missingImageId} (${entry.outputId})`);
		}

		await cache.write(entry.outputId, key, await renderCard(entry));

		return { hasMissingImage: missingImageId !== undefined, status: 'drawn' };
	} catch (error) {
		return {
			reason: `${entry.outputId}: ${error instanceof Error ? error.message : String(error)}`,
			status: 'failed',
		};
	}
}

function reportOutcomes(outcomes: ReadonlyArray<CardOutcome>, progress: Progress): void {
	const drawn = outcomes.filter((outcome) => outcome.status === 'drawn');
	const missingImageCount = drawn.filter((outcome) => outcome.hasMissingImage).length;
	const skippedCount = outcomes.filter((outcome) => outcome.status === 'cached').length;
	const failures = outcomes.filter((outcome) => outcome.status === 'failed');

	const tally = `${String(drawn.length)} generated, ${String(skippedCount)} cached`;

	if (failures.length > 0) {
		progress.fail(tally);
		for (const failure of failures) log.error(failure.reason);
		throw new UserError(`${String(failures.length)} Open Graph image(s) failed to render`);
	}

	if (missingImageCount > 0) {
		progress.warn(`${tally}, ${String(missingImageCount)} without a Featured Image`);
		return;
	}

	progress.succeed(tally);
}

// A page asking for a card nothing can draw would ship with a broken og:image
function reportUnresolved(unresolved: Array<string>): void {
	if (unresolved.length === 0) return;

	for (const outputId of unresolved) log.error(`Unresolved: ${outputId}`);

	throw new UserError(
		`${String(unresolved.length)} card(s) referenced by the build resolve to no entry`,
	);
}
