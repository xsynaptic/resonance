import { getCollection } from 'astro:content';

export async function getPublishedPosts() {
	const entries = await getCollection('posts');

	return entries.sort((first, second) => second.data.date.getTime() - first.data.date.getTime());
}
