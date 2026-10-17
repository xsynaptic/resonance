import { existsSync, readFileSync } from 'node:fs';
import { z } from 'zod';

import { sitemapLastmodPath } from '#constants.ts';

const SitemapLastmodSchema = z.object({
	generatedAt: z.string(),
	urls: z.record(z.string(), z.string()),
});

export type SitemapLastmod = z.infer<typeof SitemapLastmodSchema>;

export function getUrlPathIndexing(pathname: string) {
	const normalized = pathname.replace(/\/$/, '');

	// Paginated routes repeat content already indexed at page one
	if (/\/\d+$/.test(normalized)) return { follow: true, index: false };

	return { follow: true, index: true };
}

// Degrades rather than throws: a plain `pnpm dev` or `pnpm build` runs with no deploy step ahead of it
export function readSitemapLastmod(filePath = sitemapLastmodPath): SitemapLastmod {
	if (existsSync(filePath)) {
		try {
			return SitemapLastmodSchema.parse(JSON.parse(readFileSync(filePath, 'utf8')));
		} catch (error) {
			console.warn(
				`[sitemap] Failed to read ${filePath}; using current time as fallback. ${error instanceof Error ? error.message : String(error)}`,
			);
		}
	}

	return { generatedAt: new Date().toISOString(), urls: {} };
}
