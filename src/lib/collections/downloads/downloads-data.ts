import { getCollection } from 'astro:content';

// Cache so the collection is scanned once per build, not once per mix page
let countsPromise: Promise<Map<string, number>> | undefined;

// Filename -> completions, for lookup against mix frontmatter `files[]` entries
export function getDownloadCounts(): Promise<Map<string, number>> {
	countsPromise ??= buildCounts();
	return countsPromise;
}

async function buildCounts(): Promise<Map<string, number>> {
	const entries = await getCollection('downloads');

	return new Map(entries.map((entry) => [entry.id, entry.data.completions]));
}
