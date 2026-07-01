import { getCollection } from 'astro:content';

export async function getPublishedPosts() {
	const entries = await getCollection('posts');

	return entries.sort(
		(first, second) => second.data.dateCreated.getTime() - first.data.dateCreated.getTime(),
	);
}
