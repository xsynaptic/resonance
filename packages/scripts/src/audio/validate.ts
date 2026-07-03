import chalk from 'chalk';
import fs from 'node:fs/promises';
import path from 'node:path';
import { parse } from 'yaml';

import { AUDIO_SOURCE_DIR, MIXES_CONTENT_DIR } from './audio-paths.js';

const AUDIO_EXTENSIONS = new Set(['.flac', '.mp3']);

interface ValidateAudioOptions {
	rootPath: string;
}

// Cross-check every mixes `files[]` entry against the audio source directory
// Missing files are fatal (never publish a dead download link); orphans and flac-less mixes warn
// Returns the referenced filenames present on disk
export async function validateAudio(options: ValidateAudioOptions): Promise<Array<string>> {
	const { rootPath } = options;

	const mixesDir = path.join(rootPath, MIXES_CONTENT_DIR);
	const audioDir = path.join(rootPath, AUDIO_SOURCE_DIR);

	const mixEntries = await fs.readdir(mixesDir);
	const mdxFiles = mixEntries.filter((name) => name.endsWith('.mdx'));

	const referenced = new Set<string>();

	const frontmatterList = await Promise.all(
		mdxFiles.map((name) => fs.readFile(path.join(mixesDir, name), 'utf8')),
	);

	for (const source of frontmatterList) {
		for (const file of parseFrontmatterFiles(source)) referenced.add(file);
	}

	const onDisk = new Set<string>();

	try {
		const diskEntries = await fs.readdir(audioDir);
		for (const entry of diskEntries) {
			if (AUDIO_EXTENSIONS.has(path.extname(entry).toLowerCase())) onDisk.add(entry);
		}
	} catch {
		// audioDir may not exist yet; the missing check below reports every referenced file
	}

	const missing = [...referenced]
		.filter((file) => !onDisk.has(file))
		.sort((left, right) => left.localeCompare(right));
	const orphaned = [...onDisk]
		.filter((file) => !referenced.has(file))
		.sort((left, right) => left.localeCompare(right));
	const flacless = [...referenced]
		.filter((file) => file.toLowerCase().endsWith('.mp3'))
		.filter((file) => !referenced.has(`${file.slice(0, -'.mp3'.length)}.flac`))
		.sort((left, right) => left.localeCompare(right));

	if (orphaned.length > 0) {
		console.log(chalk.yellow(`Orphaned audio (on disk, unreferenced): ${String(orphaned.length)}`));
		for (const file of orphaned) console.log(chalk.yellow(`  ${file}`));
	}

	if (flacless.length > 0) {
		console.log(
			chalk.yellow(
				`Referenced .mp3 without a .flac sibling (rendition uses mp3): ${String(flacless.length)}`,
			),
		);
		for (const file of flacless) console.log(chalk.yellow(`  ${file}`));
	}

	if (missing.length > 0) {
		console.error(
			chalk.red(`Missing audio (referenced, absent on disk): ${String(missing.length)}`),
		);
		for (const file of missing) console.error(chalk.red(`  ${file}`));
		throw new Error(
			`Audio validation failed: ${String(missing.length)} referenced file(s) missing from ${AUDIO_SOURCE_DIR}`,
		);
	}

	const present = [...referenced]
		.filter((file) => onDisk.has(file))
		.sort((left, right) => left.localeCompare(right));

	console.log(
		chalk.green(`Audio validation passed: ${String(present.length)} referenced file(s) present`),
	);

	return present;
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
