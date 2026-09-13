import type { CollectionKey } from 'astro:content';

import { getCollectionPath } from '@xsynaptic/shared/routing';

import type { LinkedName } from '#lib/utils/terms.ts';

import { t } from '#lib/i18n/i18n-strings.ts';

export const collectionKinds: Partial<Record<CollectionKey, LinkedName>> = {
	mixes: { name: t('collection.mixes.title'), url: getCollectionPath('mixes') },
	posts: { name: t('collection.posts.title'), url: getCollectionPath('posts') },
	reviews: { name: t('collection.reviews.title'), url: getCollectionPath('reviews') },
};
