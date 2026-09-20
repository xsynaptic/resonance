import { getCollection } from 'astro:content';

import { byDateCreatedDescending } from '#lib/utils/entries.ts';

export async function getPublishedPosts() {
	const entries = await getCollection('posts');

	return entries.sort(byDateCreatedDescending);
}
