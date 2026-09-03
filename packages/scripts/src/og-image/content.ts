import { openGraphDefaultId, siteTitle } from '@xsynaptic/shared/constants';

import type { DataStoreCollections, DataStoreEntry } from '../shared/data-store.js';
import type { OpenGraphEntry } from './types.js';

import { extractImageFeaturedIds } from '../shared/images.js';
import { getCollectionLabel, openGraphCollections } from './labels.js';

export function getOpenGraphEntries(collections: DataStoreCollections): Array<OpenGraphEntry> {
	const entries: Array<OpenGraphEntry> = [getDefaultEntry()];

	for (const collection of openGraphCollections) {
		const collectionEntries = collections.get(collection);

		if (!collectionEntries) {
			throw new Error(
				`Collection "${collection}" is missing from the data store. Re-run \`astro sync\`, or drop it from labels.ts if it no longer exists.`,
			);
		}

		entries.push(...toOpenGraphEntries(collection, collectionEntries));
	}

	return entries;
}

/**
 * The card list pages, term indexes and 404 all fall back to. Its digest is fixed, so it renders
 * once and then stays cached until the template version changes.
 */
function getDefaultEntry(): OpenGraphEntry {
	return {
		digest: openGraphDefaultId,
		imageFeaturedId: undefined,
		label: undefined,
		outputId: openGraphDefaultId,
		title: siteTitle,
	};
}

function readString(value: unknown): string | undefined {
	return typeof value === 'string' && value !== '' ? value : undefined;
}

function toOpenGraphEntries(
	collection: string,
	collectionEntries: Map<string, DataStoreEntry>,
): Array<OpenGraphEntry> {
	const entries: Array<OpenGraphEntry> = [];
	const label = getCollectionLabel(collection);

	for (const entry of collectionEntries.values()) {
		const title = readString(entry.data.title);

		// A title is what makes a card worth drawing, and a digest is what makes it cacheable
		if (!title || !entry.digest) continue;

		entries.push({
			digest: entry.digest,
			imageFeaturedId: extractImageFeaturedIds(entry.data)[0],
			label,
			outputId: `${collection}-${entry.id}`,
			title,
		});
	}

	return entries;
}
