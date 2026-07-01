import { getCollection } from 'astro:content';

export async function getPublishedReviews() {
	const entries = await getCollection('reviews');

	return entries.sort(
		(first, second) => second.data.dateCreated.getTime() - first.data.dateCreated.getTime(),
	);
}
