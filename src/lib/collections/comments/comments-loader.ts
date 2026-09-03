import type { Loader } from 'astro/loaders';

import { existsSync } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

import { commentsDataPath } from '#constants.ts';

// A document lives at `<collection>/<entry-id>.json`, so its path is the id its entry is known by
export function commentsLoader(): Loader {
	return {
		load: async (context) => {
			const { logger, store } = context;

			store.clear();

			const rootPath = path.resolve(commentsDataPath);

			// Regenerable from D1, so a clone that has never run a rebuild still builds
			if (!existsSync(rootPath)) {
				logger.warn(`No comment projection at ${commentsDataPath}; building without comments`);
				return;
			}

			const filePaths = await findDocuments(rootPath);

			for (const filePath of filePaths) {
				const id = path.relative(rootPath, filePath).replace(/\.json$/, '');
				const raw: unknown = JSON.parse(await readFile(filePath, 'utf8'));
				const data = await context.parseData({ data: raw as Record<string, unknown>, id });

				store.set({ data, digest: context.generateDigest(data), id });
			}
		},
		name: 'comments-loader',
	};
}

async function findDocuments(rootPath: string): Promise<Array<string>> {
	const entries = await readdir(rootPath, { recursive: true, withFileTypes: true });

	return entries
		.filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
		.map((entry) => path.join(entry.parentPath, entry.name))
		.sort((left, right) => left.localeCompare(right));
}
