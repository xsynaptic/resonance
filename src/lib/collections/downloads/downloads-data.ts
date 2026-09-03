import { getCollection } from 'astro:content';

// Scan the collection once per build, not once per mix page
let countsPromise: Promise<Map<string, number>> | undefined;

interface MixDownloads {
	downloadsLegacy?: Record<string, number> | undefined;
	files?: Array<string> | undefined;
}

export async function getDownloadCount({ downloadsLegacy, files }: MixDownloads): Promise<number> {
	const liveCounts = await getDownloadCounts();
	const fileNames = files ?? [];

	let total = sumLegacyCounts(downloadsLegacy);

	for (const file of fileNames) {
		total += liveCounts.get(file) ?? 0;
	}

	return total;
}

export async function getDownloadTotal(): Promise<number> {
	const liveCounts = await getDownloadCounts();
	const mixes = await getCollection('mixes');

	let total = 0;

	for (const count of liveCounts.values()) {
		total += count;
	}

	for (const mix of mixes) {
		total += sumLegacyCounts(mix.data.downloadsLegacy);
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

function sumLegacyCounts(downloadsLegacy: Record<string, number> | undefined): number {
	const counts = Object.values(downloadsLegacy ?? {});

	let total = 0;

	for (const count of counts) {
		total += count;
	}

	return total;
}
