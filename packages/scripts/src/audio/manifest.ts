import type { MixAudioEntry, StreamLoudness } from '@xsynaptic/shared/schemas';

import { mixAudioPath } from '@xsynaptic/shared/constants';
import { MixAudioDocumentSchema, mixAudioVersion } from '@xsynaptic/shared/schemas';
import chalk from 'chalk';
import fs from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';

import type { AudioSource } from '#audio/audio-sources.ts';

import { audioSourceDir, streamsDir, waveformsCacheDir } from '#audio/audio-paths.ts';
import { collectAudioSources } from '#audio/audio-sources.ts';
import { collectRenditions, readRenditionLoudness } from '#audio/renditions.ts';
import { collectArchives, previewVersion, readWaveformHeader } from '#audio/waveforms.ts';
import { contentDataPath } from '#shared/content-path.ts';

const previewExtension = '.json';
const tmpExtension = '.tmp';

// Rejecting a stale preview shape here is what stops it reaching a page
const PreviewSchema = z.object({
	seconds: z.number(),
	values: z.number().array(),
	version: z.literal(previewVersion),
});

interface ManifestEntries {
	entries: Array<MixAudioEntry>;
	// A source missing any one of its three outputs, named for the warning
	incomplete: Array<string>;
	sourceCount: number;
}

interface ManifestOptions {
	dryRun?: boolean;
	rootPath: string;
}

// Runs after renditions and waveforms because it reads both of their outputs
export async function generateAudioManifest(options: ManifestOptions): Promise<void> {
	const { dryRun = false, rootPath } = options;

	const outputPath = path.resolve(rootPath, contentDataPath, mixAudioPath);

	const { entries, incomplete, sourceCount } = await collectManifestEntries(rootPath);

	console.log(
		chalk.blue(
			`Manifest: ${String(entries.length)} of ${String(sourceCount)} mixes carry a rendition, an archive and a preview`,
		),
	);

	if (incomplete.length > 0) {
		console.warn(chalk.yellow(`  ${String(incomplete.length)} incomplete and left out:`));
		for (const base of incomplete) console.warn(chalk.yellow(`    ${base}`));
	}

	await assertManifestNotEmptied(entries.length, rootPath);

	if (dryRun) {
		console.log(chalk.yellow(`  DRY RUN write: ${outputPath}`));
		return;
	}

	await fs.mkdir(path.dirname(outputPath), { recursive: true });
	await writeDocument(outputPath, entries);

	console.log(chalk.green(`Manifest written: ${outputPath}`));
}

// The deploy probe needs a filename per location, and the manifest is the only place one is written
export async function readManifestFiles(
	rootPath: string,
): Promise<{ archives: Array<string>; streams: Array<string> }> {
	try {
		const raw: unknown = JSON.parse(
			await fs.readFile(path.resolve(rootPath, contentDataPath, mixAudioPath), 'utf8'),
		);
		const { mixes } = MixAudioDocumentSchema.parse(raw);

		return {
			archives: mixes.map((mix) => mix.archive),
			streams: mixes.map((mix) => mix.stream),
		};
	} catch {
		return { archives: [], streams: [] };
	}
}

// An audio directory that exists but is empty reads as zero sources rather than an error
async function assertManifestNotEmptied(count: number, rootPath: string): Promise<void> {
	if (count > 0) return;

	const { streams } = await readManifestFiles(rootPath);

	if (streams.length === 0) return;

	throw new Error(
		`Refusing to overwrite ${String(streams.length)} manifest entries with an empty manifest; no audio sources found in ${audioSourceDir}`,
	);
}

async function collectManifestEntries(rootPath: string): Promise<ManifestEntries> {
	const cacheDir = path.join(rootPath, waveformsCacheDir);

	const sources = await collectAudioSources(path.join(rootPath, audioSourceDir));
	const renditions = await collectRenditions(path.join(rootPath, streamsDir));
	const archives = await collectArchives(cacheDir);

	const entries: Array<MixAudioEntry> = [];
	const incomplete: Array<string> = [];

	for (const source of sources) {
		const stream = renditions.get(source.base);
		const entry = await resolveEntry({
			archive: archives.get(source.base),
			cacheDir,
			loudness:
				stream === undefined
					? undefined
					: await readRenditionLoudness(path.join(rootPath, streamsDir, stream)),
			source,
			stream,
		});

		if (entry) entries.push(entry);
		else incomplete.push(source.base);
	}

	return { entries, incomplete, sourceCount: sources.length };
}

async function readPreview(file: string) {
	try {
		const parsed: unknown = JSON.parse(await fs.readFile(file, 'utf8'));

		return PreviewSchema.parse(parsed);
	} catch {
		return;
	}
}

// A mix missing its rendition, loudness tags, preview is left out rather than half-published
async function resolveEntry({
	archive,
	cacheDir,
	loudness,
	source,
	stream,
}: {
	archive: string | undefined;
	cacheDir: string;
	loudness: StreamLoudness | undefined;
	source: AudioSource;
	stream: string | undefined;
}): Promise<MixAudioEntry | undefined> {
	if (archive === undefined || loudness === undefined || stream === undefined) return undefined;

	const preview = await readPreview(path.join(cacheDir, `${source.base}${previewExtension}`));
	if (preview === undefined) return undefined;

	const { pairs, sampleRate, samplesPerPixel } = await readWaveformHeader(
		path.join(cacheDir, archive),
	);

	return {
		archive,
		base: source.base,
		loudness,
		pairs,
		pairsPerSecond: sampleRate / samplesPerPixel,
		peaks: preview.values,
		seconds: preview.seconds,
		sources: source.files,
		stream,
	};
}

// One row per line, so a diff names the mixes that changed; 400 peaks pretty-printed is 27k lines
async function writeDocument(outputPath: string, entries: Array<MixAudioEntry>): Promise<void> {
	const rows = entries.map((entry) => `\t\t${JSON.stringify(entry)}`).join(',\n');
	const document = `{\n\t"mixes": [\n${rows}\n\t],\n\t"version": ${String(mixAudioVersion)}\n}\n`;
	const tmp = `${outputPath}${tmpExtension}`;

	await fs.writeFile(tmp, document, 'utf8');
	await fs.rename(tmp, outputPath);
}
