import { getCollection } from 'astro:content';
import { createHash } from 'node:crypto';

import type { MixQueueItem } from '#lib/collections/mixes/mixes-queue.ts';

import { getMixQueueItem } from '#lib/collections/mixes/mixes-queue.ts';
import { site } from '#lib/site.ts';
import { getWorkTitle } from '#lib/utils/work-title.ts';

const cataloguePath = '/api/player/catalogue.json';

let cataloguePromise: Promise<Array<MixQueueItem>> | undefined;

export function getPlayerCatalogue(): Promise<Array<MixQueueItem>> {
	if (import.meta.env.DEV) return buildCatalogue();
	if (!cataloguePromise) cataloguePromise = buildCatalogue();

	return cataloguePromise;
}

// In the query rather than the path, so a page cached across a deploy still finds a catalogue
export async function getPlayerCatalogueUrl(): Promise<string> {
	// The dev server sends no `immutable`, so a page there skips building every Mix
	if (import.meta.env.DEV) return cataloguePath;

	const version = createHash('sha256')
		.update(JSON.stringify(await getPlayerCatalogue()))
		.digest('hex')
		.slice(0, 12);

	return `${cataloguePath}?v=${version}`;
}

// Sorted, so the hash moves only when a Mix does
async function buildCatalogue(): Promise<Array<MixQueueItem>> {
	const mixes = await getCollection('mixes');

	const items = await Promise.all(
		mixes
			.toSorted((first, second) => first.id.localeCompare(second.id))
			.map(async (entry) => {
				const work = await getWorkTitle(entry);

				return getMixQueueItem(entry, work.credit?.name ?? site.title);
			}),
	);

	return items.filter((item) => item !== undefined);
}
