import { openGraphDefaultId, siteTitle } from '@xsynaptic/shared/constants';

import type { ContentEntry } from '../shared/astro-content.js';
import type { OpenGraphEntry } from './types.js';

import { extractImageFeaturedIds } from '../shared/images.js';
import { getCollectionLabel } from './labels.js';

/**
 * The card list pages, term indexes and 404 all fall back to. Its digest is fixed, so it renders
 * once and then stays cached until the template version changes.
 */
export function getDefaultEntry(): OpenGraphEntry {
	return {
		digest: openGraphDefaultId,
		imageFeaturedId: undefined,
		label: undefined,
		outputId: openGraphDefaultId,
		title: siteTitle,
	};
}

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
		// The stem `getOpenGraphId` builds in `src/lib/utils/seo.ts`; a divergence reads as an unresolved card
		outputId: `${entry.collection}-${entry.id}`,
		title,
	};
}
