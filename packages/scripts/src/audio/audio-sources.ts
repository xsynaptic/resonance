import fs from 'node:fs/promises';
import path from 'node:path';

export interface AudioSource {
	base: string;
	path: string;
}

// Ordered by preference; the earliest match claims the base name
const SOURCE_EXTENSIONS = ['.flac', '.mp3'];

// One entry per mix, keyed by filename minus extension
// Shared by every derivation that reads the source directory rather than frontmatter
export async function collectAudioSources(sourceDir: string): Promise<Array<AudioSource>> {
	const entries = await readSourceDir(sourceDir);
	const sources = new Map<string, AudioSource>();

	for (const entry of entries) {
		const rank = preferenceRank(entry);

		if (rank === -1) continue;

		const base = entry.slice(0, -path.extname(entry).length);
		const existing = sources.get(base);

		if (existing && preferenceRank(existing.path) <= rank) continue;

		sources.set(base, { base, path: path.join(sourceDir, entry) });
	}

	return [...sources.values()].sort((left, right) => left.base.localeCompare(right.base));
}

function preferenceRank(file: string): number {
	return SOURCE_EXTENSIONS.indexOf(path.extname(file).toLowerCase());
}

async function readSourceDir(sourceDir: string): Promise<Array<string>> {
	try {
		return await fs.readdir(sourceDir);
	} catch {
		throw new Error(`Audio source directory not found: ${sourceDir}`);
	}
}
