import { getCollection } from 'astro:content';

export async function getPublishedMixes() {
	const entries = await getCollection('mixes');

	return entries.sort(
		(first, second) => second.data.dateCreated.getTime() - first.data.dateCreated.getTime(),
	);
}
