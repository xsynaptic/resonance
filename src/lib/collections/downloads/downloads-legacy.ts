import { existsSync } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { parse } from 'yaml';
import { z } from 'zod';

import { contentCollectionsPath, legacyDownloadsPath } from '#constants.ts';

// Keyed on slug then format, because a filename is a delivery path and gets renamed
const legacyDocumentSchema = z.record(
	z.string(),
	z.record(z.string(), z.object({ count: z.number() }).loose()),
);

// A row that no longer resolves is fatal; the alternative is a count that quietly stops rendering
export async function readLegacyDownloadCounts(): Promise<Map<string, number>> {
	const filePath = path.resolve(legacyDownloadsPath);
	const counts = new Map<string, number>();

	if (!existsSync(filePath)) return counts;

	const document = legacyDocumentSchema.parse(parse(await readFile(filePath, 'utf8')));
	const mixes = await readMixFiles();

	for (const [slug, formats] of Object.entries(document)) {
		const files = mixes.get(slug);

		if (!files) {
			throw new Error(
				`${legacyDownloadsPath} carries "${slug}", which is not a mix; rename the key or remove the row`,
			);
		}

		for (const [format, entry] of Object.entries(formats)) {
			const file = files.find((name) => name.toLowerCase().endsWith(`.${format}`));

			if (!file) {
				throw new Error(
					`${legacyDownloadsPath} carries "${slug}.${format}", which "${slug}" does not list in \`files\`; rename the format or remove the row`,
				);
			}

			counts.set(file, entry.count);
		}
	}

	return counts;
}

// Mirrors the glob loader in content.config.ts; `_`-prefixed drafts are not in the collection
async function readMixFiles(): Promise<Map<string, Array<string>>> {
	const mixesPath = path.resolve(contentCollectionsPath, 'mixes');
	const entries = await readdir(mixesPath, { recursive: true, withFileTypes: true });
	const mixes = new Map<string, Array<string>>();

	for (const entry of entries) {
		if (!entry.isFile() || !entry.name.endsWith('.mdx') || entry.name.startsWith('_')) continue;

		const source = await readFile(path.join(entry.parentPath, entry.name), 'utf8');
		const frontmatter = /^---\n([\s\S]*?)\n---/.exec(source);

		if (!frontmatter) continue;

		const { files } = parse(String(frontmatter[1])) as { files?: Array<string> };

		mixes.set(entry.name.replace(/\.mdx$/, ''), files ?? []);
	}

	return mixes;
}
