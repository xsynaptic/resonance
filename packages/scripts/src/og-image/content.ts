import { getOpenGraphId } from '@xsynaptic/shared/open-graph';

import type { OpenGraphEntry } from '#og-image/types.ts';
import type { ContentEntry } from '#shared/astro-content.ts';

import { getCollectionLabel } from '#og-image/labels.ts';
import { extractImageFeaturedIds } from '#shared/images.ts';

// The one place an entry becomes a card
export function toOpenGraphEntry(entry: ContentEntry): OpenGraphEntry | undefined {
	const title = typeof entry.data.title === 'string' ? entry.data.title : undefined;

	// A title is what makes a card worth drawing, and a digest is what makes it cacheable
	if (!title || entry.digest === undefined) return undefined;

	return {
		// Astro widens `digest` to `string | number`; the cache key is a string either way
		digest: String(entry.digest),
		imageFeaturedId: extractImageFeaturedIds(entry.data)[0],
		label: getCollectionLabel(entry.collection),
		outputId: getOpenGraphId(entry.collection, entry.id),
		title,
	};
}
