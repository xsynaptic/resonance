import type { AstroIntegrationLogger } from 'astro';
import type { Loader } from 'astro/loaders';

import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';

import { downloadsStatsPath } from '#constants.ts';

const downloadsDocumentSchema = z.object({
	files: z.record(z.string(), z.unknown()).array(),
	version: z.literal(1),
});

// Keyed on the full object key, `artifacts/` and `stream/` rows alike
type LiveStats = Map<string, Record<string, unknown>>;

export function downloadsLoader(): Loader {
	return {
		load: async (context) => {
			const { logger, store } = context;

			store.clear();

			const live = await readLiveStats(logger);

			for (const [id, stats] of live) {
				const completions = Number(stats.completions ?? 0);
				const data = await context.parseData({ data: { ...stats, completions, key: id }, id });

				store.set({ data, digest: context.generateDigest(data), id });
			}
		},
		name: 'downloads-loader',
	};
}

// Never fatal, and an absent file is the normal local state; the frozen counts live in mix frontmatter
async function readLiveStats(logger: AstroIntegrationLogger): Promise<LiveStats> {
	const filePath = path.resolve(downloadsStatsPath);
	const stats: LiveStats = new Map();

	if (!existsSync(filePath)) return stats;

	try {
		const raw: unknown = JSON.parse(await readFile(filePath, 'utf8'));

		for (const file of downloadsDocumentSchema.parse(raw).files) {
			stats.set(String(file.key), file);
		}
	} catch (error) {
		logger.warn(`Ignoring downloads.json; building without live counts (${String(error)})`);
		stats.clear();
	}

	return stats;
}
