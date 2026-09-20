import { getCollection } from 'astro:content';

import { byDateCreatedDescending } from '#lib/utils/entries.ts';

export async function getPublishedMixes() {
	const entries = await getCollection('mixes');

	return entries.sort(byDateCreatedDescending);
}
