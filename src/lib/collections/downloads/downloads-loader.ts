import type { AstroIntegrationLogger } from 'astro';
import type { Loader } from 'astro/loaders';

import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';

import { downloadsStatsPath } from '#constants.ts';
import { readLegacyDownloadCounts } from '#lib/collections/downloads/downloads-legacy.ts';

const downloadsDocumentSchema = z.object({
	files: z.record(z.string(), z.unknown()).array(),
	version: z.literal(1),
});

// Keyed on the bare filename, matching mix frontmatter `files[]` 1:1
type LiveStats = Map<string, Record<string, unknown>>;

export function downloadsLoader(): Loader {
	return {
		load: async (context) => {
			const { logger, store } = context;

			store.clear();

			const legacy = await readLegacyDownloadCounts();
			const live = await readLiveStats(logger);

			if (legacy.size === 0 && live.size === 0) {
				logger.warn('No download counts found; building without them');
				return;
			}

			const ids = new Set([...legacy.keys(), ...live.keys()]);

			for (const id of ids) {
				const stats = live.get(id);
				const completions = Number(stats?.completions ?? 0) + (legacy.get(id) ?? 0);
				const data = await context.parseData({ data: { ...stats, completions, key: id }, id });

				store.set({ data, digest: context.generateDigest(data), id });
			}
		},
		name: 'downloads-loader',
	};
}

// Never fatal: live counts are decoration over the legacy record, which is the real one
async function readLiveStats(logger: AstroIntegrationLogger): Promise<LiveStats> {
	const filePath = path.resolve(downloadsStatsPath);
	const stats: LiveStats = new Map();

	if (!existsSync(filePath)) return stats;

	try {
		const raw: unknown = JSON.parse(await readFile(filePath, 'utf8'));

		for (const file of downloadsDocumentSchema.parse(raw).files) {
			stats.set(String(file.key).replace(/^artifacts\//, ''), file);
		}
	} catch (error) {
		logger.warn(`Ignoring downloads.json; building on legacy counts alone (${String(error)})`);
		stats.clear();
	}

	return stats;
}
