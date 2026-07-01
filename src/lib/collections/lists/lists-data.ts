import { getCollection } from 'astro:content';

export async function getPublishedLists() {
	const entries = await getCollection('lists');

	return entries.sort(
		(first, second) => second.data.dateCreated.getTime() - first.data.dateCreated.getTime(),
	);
}
