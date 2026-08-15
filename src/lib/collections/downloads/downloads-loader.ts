import type { Loader } from 'astro/loaders';

import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';

import { DOWNLOADS_STATS_PATH } from '#constants.ts';

// Per-entry validation happens via parseData against the collection schema
const downloadsDocumentSchema = z.object({
	files: z.record(z.string(), z.unknown()).array(),
	version: z.literal(1),
});

// Reads the locally pulled downloads.json
// A missing or invalid file must never fail the build; counts are decoration
export function downloadsLoader(): Loader {
	return {
		load: async (context) => {
			const { logger, store } = context;
			const filePath = path.resolve(DOWNLOADS_STATS_PATH);

			store.clear();

			if (!existsSync(filePath)) {
				logger.warn('No downloads.json found; building without download counts (pnpm stats-pull)');
				return;
			}

			try {
				const raw: unknown = JSON.parse(await readFile(filePath, 'utf8'));
				const document = downloadsDocumentSchema.parse(raw);

				for (const file of document.files) {
					// ID is the bare filename, matching `files[]` entries in mix frontmatter 1:1
					const id = String(file.key).replace(/^artifacts\//, '');
					const data = await context.parseData({ data: file, id });

					store.set({ data, digest: context.generateDigest(data), id });
				}
			} catch (error) {
				logger.warn(
					`Could not load downloads.json; building without download counts (${String(error)})`,
				);
				store.clear();
			}
		},
		name: 'downloads-loader',
	};
}
