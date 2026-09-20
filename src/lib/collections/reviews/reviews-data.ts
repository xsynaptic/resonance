import { getCollection } from 'astro:content';

import { byDateCreatedDescending } from '#lib/utils/entries.ts';

export async function getPublishedReviews() {
	const entries = await getCollection('reviews');

	return entries.sort(byDateCreatedDescending);
}
