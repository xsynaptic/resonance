import { getCollection } from 'astro:content';

export async function getPublishedDesigns() {
	const entries = await getCollection('designs');

	return entries.sort(
		(first, second) => second.data.dateCreated.getTime() - first.data.dateCreated.getTime(),
	);
}
