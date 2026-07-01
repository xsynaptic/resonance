import { getCollection } from 'astro:content';

export async function getPublishedPages() {
	return getCollection('pages');
}
