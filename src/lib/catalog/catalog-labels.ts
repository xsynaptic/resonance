import type { CollectionKey } from 'astro:content';

import { t } from '#lib/i18n/i18n-strings.ts';

// Subtitle for a card in a mixed-collection list, where the collection is what tells items apart
export const collectionLabels: Partial<Record<CollectionKey, string>> = {
	mixes: t('collection.mixes.label'),
	posts: t('collection.posts.label'),
	reviews: t('collection.reviews.label'),
};
