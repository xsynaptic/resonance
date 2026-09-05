import chalk from 'chalk';
import fs from 'node:fs/promises';
import path from 'node:path';
import { parse } from 'yaml';

import { audioSourceDir, mixesContentDir } from '#audio/audio-paths.ts';

const audioExtensions = new Set(['.flac', '.mp3']);

interface ValidateAudioOptions {
	rootPath: string;
}

// Cross-check every mixes `files[]` entry against the audio source directory
// Missing files are fatal (never publish a dead download link); orphans and flac-less mixes warn
// Returns the referenced filenames present on disk
export async function validateAudio(options: ValidateAudioOptions): Promise<Array<string>> {
	const { rootPath } = options;

	const referenced = await collectReferenced(path.join(rootPath, mixesContentDir));
	const onDisk = await collectOnDisk(path.join(rootPath, audioSourceDir));

	const missing = sortFiles([...referenced].filter((file) => !onDisk.has(file)));
	const orphaned = sortFiles([...onDisk].filter((file) => !referenced.has(file)));
	const flacless = sortFiles(
		[...referenced].filter((file) => isMissingFlacSibling(file, referenced)),
	);
	const present = sortFiles([...referenced].filter((file) => onDisk.has(file)));

	report(orphaned, `Orphaned audio (on disk, unreferenced): ${String(orphaned.length)}`, warn);
	report(
		flacless,
		`Referenced .mp3 without a .flac sibling (rendition uses mp3): ${String(flacless.length)}`,
		warn,
	);
	report(missing, `Missing audio (referenced, absent on disk): ${String(missing.length)}`, fail);

	if (missing.length > 0) {
		throw new Error(
			`Audio validation failed: ${String(missing.length)} referenced file(s) missing from ${audioSourceDir}`,
		);
	}

	console.log(
		chalk.green(`Audio validation passed: ${String(present.length)} referenced file(s) present`),
	);

	return present;
}

async function collectOnDisk(audioDir: string): Promise<Set<string>> {
	let entries: Array<string>;

	try {
		entries = await fs.readdir(audioDir);
	} catch {
		// audioDir may not exist yet; the missing check reports every referenced file in that case
		return new Set();
	}

	return new Set(entries.filter((entry) => audioExtensions.has(path.extname(entry).toLowerCase())));
}

async function collectReferenced(mixesDir: string): Promise<Set<string>> {
	// Mixes are filed under year directories, so a flat read matches nothing
	const entries = await fs.readdir(mixesDir, { recursive: true });
	const sources = await Promise.all(
		entries
			.filter((name) => name.endsWith('.mdx') && !path.basename(name).startsWith('_'))
			.map((name) => fs.readFile(path.join(mixesDir, name), 'utf8')),
	);

	return new Set(sources.flatMap((source) => parseFrontmatterFiles(source)));
}

function fail(line: string): void {
	console.error(chalk.red(line));
}

function isMissingFlacSibling(file: string, referenced: Set<string>): boolean {
	if (!file.toLowerCase().endsWith('.mp3')) return false;

	return !referenced.has(`${file.slice(0, -'.mp3'.length)}.flac`);
}

function parseFrontmatterFiles(source: string): Array<string> {
	// Tolerate CRLF fences so a stray carriage return never silently skips a mix's files[]
	const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(source);

	const body = match?.[1];
	if (body === undefined) return [];

	const data: unknown = parse(body);
	if (typeof data !== 'object' || data === null) return [];

	const { files } = data as Record<string, unknown>;
	if (!Array.isArray(files)) return [];

	return files.filter((entry): entry is string => typeof entry === 'string');
}

function report(files: Array<string>, heading: string, log: (line: string) => void): void {
	if (files.length === 0) return;

	log(heading);
	for (const file of files) log(`  ${file}`);
}

function sortFiles(files: Array<string>): Array<string> {
	return files.sort((left, right) => left.localeCompare(right));
}

function warn(line: string): void {
	console.log(chalk.yellow(line));
}
