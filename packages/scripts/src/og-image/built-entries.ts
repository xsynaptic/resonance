import { openGraphBasePath } from '@xsynaptic/shared/constants';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

import type { OpenGraphEntry } from './types.js';

import { getCollectionEntries, withAstroContent } from '../shared/astro-content.js';
import { getDefaultEntry, toOpenGraphEntry } from './content.js';
import { openGraphCollections } from './labels.js';

// Astro writes `content` before `property`, and `og:image:width` must not match
const openGraphMetaPattern = /<meta content="([^"]+)" property="og:image"\s*\/?>/g;

// Built HTML decides which cards exist, so none is drawn for an entry no page references
// A stem it asks for that resolves to nothing means `seo.ts` and this generator have diverged
export async function getBuiltEntries({
	distPath,
}: {
	distPath: string;
}): Promise<{ entries: Array<OpenGraphEntry>; unresolved: Array<string> }> {
	if (!existsSync(distPath)) {
		throw new Error(`No build to read at ${distPath}. Run \`pnpm build\` first.`);
	}

	const candidates = await buildCandidates();

	const entries: Array<OpenGraphEntry> = [];
	const unresolved: Array<string> = [];

	for (const outputId of extractBuiltOutputIds(distPath)) {
		const entry = candidates.get(outputId);

		if (entry) {
			entries.push(entry);
		} else {
			unresolved.push(outputId);
		}
	}

	return { entries, unresolved };
}

// Every card an entry could produce, keyed by the stem the build asks for
async function buildCandidates(): Promise<Map<string, OpenGraphEntry>> {
	const contentEntries = await withAstroContent((content) =>
		getCollectionEntries(content, openGraphCollections),
	);

	const defaultEntry = getDefaultEntry();
	const candidates = new Map<string, OpenGraphEntry>([[defaultEntry.outputId, defaultEntry]]);

	for (const contentEntry of contentEntries) {
		const entry = toOpenGraphEntry(contentEntry);

		if (entry) candidates.set(entry.outputId, entry);
	}

	return candidates;
}

function extractBuiltOutputIds(distPath: string): Set<string> {
	const pathSegment = `/${openGraphBasePath}/`;
	const outputIds = new Set<string>();

	function collectFromHtml(filePath: string): void {
		const html = readFileSync(filePath, 'utf8');

		for (const match of html.matchAll(openGraphMetaPattern)) {
			const url = match[1] ?? '';
			const index = url.indexOf(pathSegment);

			if (index === -1) continue;

			// Cards may sit on another origin, so only the trailing filename is meaningful
			const outputId = url.slice(index + pathSegment.length).replace(/\.[^.]+$/, '');

			if (outputId) outputIds.add(outputId);
		}
	}

	function walk(directory: string): void {
		const dirents = readdirSync(directory, { withFileTypes: true });

		for (const dirent of dirents) {
			const fullPath = path.join(directory, dirent.name);

			if (dirent.isDirectory()) {
				walk(fullPath);
				continue;
			}

			if (dirent.isFile() && dirent.name.endsWith('.html')) collectFromHtml(fullPath);
		}
	}

	walk(distPath);

	return outputIds;
}
