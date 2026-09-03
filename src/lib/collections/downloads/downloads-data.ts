import { getCollection } from 'astro:content';

// Scan the collection once per build, not once per mix page
let countsPromise: Promise<Map<string, number>> | undefined;

export async function getDownloadCount(files: Array<string> | undefined): Promise<number> {
	if (!files || files.length === 0) return 0;

	const counts = await getDownloadCounts();

	let total = 0;

	for (const file of files) {
		total += counts.get(file) ?? 0;
	}

	return total;
}

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

// Keyed on filename, matching mix frontmatter `files[]`
function getDownloadCounts(): Promise<Map<string, number>> {
	if (!countsPromise) countsPromise = buildCounts();
	return countsPromise;
}
