// A per-pull line rather than a per-track one; the current value is the last line, a delta the last two

import { appendFile, mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';

import { isPathPresent } from '#shared/utils.ts';

// Carried on every line rather than in a file header, so an old line stays readable beside a new one
const generationVersion = 1;

export interface StatsGeneration {
	generated_at: string;
	items: Record<string, StatsItem>;
	version: number;
}

// Wire names differ between the two services, so the stored names are neutral
// `plays` is the only figure rendered; the rest are stored so revisiting that costs no re-fetch
export interface StatsItem {
	comments?: number;
	// SoundCloud only: survives a permalink rename, so it stitches a series across the break
	id?: string;
	likes?: number;
	listeners?: number;
	plays: number;
	reposts?: number;
}

// A plain append, because rewriting a growing file to add one line gets worse every run
export async function appendGeneration(
	filePath: string,
	items: Record<string, StatsItem>,
): Promise<void> {
	const generation = {
		generated_at: `${new Date().toISOString().slice(0, 19)}Z`,
		items,
		version: generationVersion,
	} satisfies StatsGeneration;

	// `appendFile` will not create `data/`, and the soft-fail above would swallow the ENOENT
	await mkdir(path.dirname(filePath), { recursive: true });
	await appendFile(filePath, `${JSON.stringify(generation)}\n`, 'utf8');
}

export function isFresh(generation: StatsGeneration | undefined, hours: number): boolean {
	if (!generation) return false;

	const generatedAt = Date.parse(generation.generated_at);

	if (Number.isNaN(generatedAt)) return false;

	return Date.now() - generatedAt < hours * 3_600_000;
}

// `undefined` where the file is absent, so a caller can skip a check rather than fail it
export async function readGenerationKeys(filePath: string): Promise<Set<string> | undefined> {
	const generation = await readLastGeneration(filePath);

	return generation ? new Set(Object.keys(generation.items)) : undefined;
}

// A crash mid-append can only tear the last line; the one before it is still whole
export async function readLastGeneration(filePath: string): Promise<StatsGeneration | undefined> {
	if (!(await isPathPresent(filePath))) return undefined;

	const contents = await readFile(filePath, 'utf8');
	const lines = contents.split('\n');

	for (let index = lines.length - 1; index >= 0; index -= 1) {
		const generation = toGeneration(lines[index]);

		if (generation) return generation;
	}

	return undefined;
}

function toGeneration(line: string | undefined): StatsGeneration | undefined {
	if (!line || line.trim() === '') return undefined;

	try {
		const parsed = JSON.parse(line) as Partial<StatsGeneration>;

		if (typeof parsed.generated_at !== 'string') return undefined;
		if (parsed.version !== generationVersion) return undefined;
		if (parsed.items === undefined || typeof parsed.items !== 'object') return undefined;

		return { generated_at: parsed.generated_at, items: parsed.items, version: parsed.version };
	} catch {
		return undefined;
	}
}
