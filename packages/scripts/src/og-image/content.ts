import { getOpenGraphId } from '@xsynaptic/shared/open-graph';

import type { OpenGraphEntry } from '#og-image/types.ts';
import type { ContentEntry } from '#shared/astro-content.ts';

import { getCollectionLabel } from '#og-image/labels.ts';
import { extractImageFeaturedIds } from '#shared/images.ts';

const collectionsWithStyle = new Set(['mixes', 'reviews']);

export function getStyleTitles(entries: Array<ContentEntry>): Map<string, string> {
	const titles = new Map<string, string>();

	for (const entry of entries) {
		if (entry.collection !== 'styles') continue;
		if (typeof entry.data.title === 'string') titles.set(entry.id, entry.data.title);
	}

	return titles;
}

// The one place an entry becomes a card
export function toOpenGraphEntry(
	entry: ContentEntry,
	styleTitles: Map<string, string>,
): OpenGraphEntry | undefined {
	const title = typeof entry.data.title === 'string' ? entry.data.title : undefined;

	// A title is what makes a card worth drawing, and a digest is what makes it cacheable
	if (!title || entry.digest === undefined) return undefined;

	return {
		// Astro widens `digest` to `string | number`; the cache key is a string either way
		digest: String(entry.digest),
		imageFeaturedId: extractImageFeaturedIds(entry.data)[0],
		label: getCollectionLabel(entry.collection),
		outputId: getOpenGraphId(entry.collection, entry.id),
		style: getStyleTitle(entry, styleTitles),
		title,
	};
}

function getStyleTitle(entry: ContentEntry, styleTitles: Map<string, string>): string | undefined {
	if (!collectionsWithStyle.has(entry.collection)) return undefined;

	const styles = entry.data.styles;

	if (!Array.isArray(styles)) return undefined;

	const reference: unknown = styles[0];

	if (typeof reference !== 'object' || reference === null || !('id' in reference)) return undefined;

	return typeof reference.id === 'string' ? styleTitles.get(reference.id) : undefined;
}
