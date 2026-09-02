import { getCollection } from 'astro:content';

// Scan the collection once per build, not once per mix page
let countsPromise: Promise<Map<string, number>> | undefined;

// Keyed on filename, matching mix frontmatter `files[]`
export function getDownloadCounts(): Promise<Map<string, number>> {
	if (!countsPromise) countsPromise = buildCounts();
	return countsPromise;
}

// Counts every format, as the per-file figures on each page already do
export async function getDownloadTotal(): Promise<number> {
	const counts = await getDownloadCounts();

	let total = 0;

	for (const count of counts.values()) {
		total += count;
	}

	return total;
}

async function buildCounts(): Promise<Map<string, number>> {
	const entries = await getCollection('downloads');

	return new Map(entries.map((entry) => [entry.id, entry.data.completions]));
}
