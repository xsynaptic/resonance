import { getCollection } from 'astro:content';
import { createHash } from 'node:crypto';

import type { MixQueueItem } from '#lib/collections/mixes/mixes-queue.ts';

import { getMixQueueItem } from '#lib/collections/mixes/mixes-queue.ts';

const libraryPath = '/api/player/library.json';

let libraryPromise: Promise<Array<MixQueueItem>> | undefined;

export function getPlayerLibrary(): Promise<Array<MixQueueItem>> {
	if (import.meta.env.DEV) return buildLibrary();
	if (!libraryPromise) libraryPromise = buildLibrary();

	return libraryPromise;
}

// In the query rather than the path, so a page cached across a deploy still finds a Library
export async function getPlayerLibraryUrl(): Promise<string> {
	// The dev server sends no `immutable`, so a page there skips building every Mix
	if (import.meta.env.DEV) return libraryPath;

	const version = createHash('sha256')
		.update(JSON.stringify(await getPlayerLibrary()))
		.digest('hex')
		.slice(0, 12);

	return `${libraryPath}?v=${version}`;
}

// Sorted, so the hash moves only when a Mix does
async function buildLibrary(): Promise<Array<MixQueueItem>> {
	const mixes = await getCollection('mixes');

	const items = await Promise.all(
		mixes
			.toSorted((first, second) => first.id.localeCompare(second.id))
			.map((entry) => getMixQueueItem(entry)),
	);

	return items.filter((item) => item !== undefined);
}
