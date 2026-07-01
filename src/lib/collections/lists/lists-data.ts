import { getCollection } from 'astro:content';

export async function getPublishedLists() {
	const entries = await getCollection('lists');

	return entries.sort((first, second) => second.data.date.getTime() - first.data.date.getTime());
}
