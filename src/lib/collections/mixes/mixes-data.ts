import { getCollection } from 'astro:content';

export async function getPublishedMixes() {
	const entries = await getCollection('mixes');

	return entries.sort((first, second) => second.data.date.getTime() - first.data.date.getTime());
}
