import fs from 'node:fs/promises';
import path from 'node:path';

export interface AudioSource {
	base: string;
	path: string;
}

// One entry per mix, keyed by filename minus extension, FLAC preferred over MP3
// Shared by every derivation that reads the source directory rather than frontmatter
export async function collectAudioSources(sourceDir: string): Promise<Array<AudioSource>> {
	let entries: Array<string>;

	try {
		entries = await fs.readdir(sourceDir);
	} catch {
		throw new Error(`Audio source directory not found: ${sourceDir}`);
	}

	const paired = new Map<string, { flac?: string; mp3?: string }>();

	for (const entry of entries) {
		const ext = path.extname(entry).toLowerCase();
		if (ext !== '.mp3' && ext !== '.flac') continue;

		const base = entry.slice(0, -ext.length);
		const record = paired.get(base) ?? {};

		if (ext === '.flac') record.flac = entry;
		else record.mp3 = entry;

		paired.set(base, record);
	}

	const sources: Array<AudioSource> = [];

	for (const [base, record] of paired) {
		const name = record.flac ?? record.mp3;
		if (name === undefined) continue;

		sources.push({ base, path: path.join(sourceDir, name) });
	}

	return sources;
}
