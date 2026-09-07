import type { MixStreamEntry, MixWaveformEntry } from '@xsynaptic/shared/schemas';

import { mixStreamsPath, mixWaveformsPath } from '@xsynaptic/shared/constants';
import {
	MixStreamsDocumentSchema,
	mixStreamsVersion,
	mixWaveformsVersion,
} from '@xsynaptic/shared/schemas';
import chalk from 'chalk';
import fs from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';

import { audioSourceDir, streamsDir, waveformsCacheDir } from '#audio/audio-paths.ts';
import { collectAudioSources } from '#audio/audio-sources.ts';
import { collectRenditions } from '#audio/renditions.ts';
import { previewVersion } from '#audio/waveforms.ts';

const previewExtension = '.json';
const tmpExtension = '.tmp';

// A v1 preview is 2000 buckets of 0..255; rejecting it here is what stops the old shape reaching a page
const PreviewSchema = z.object({
	seconds: z.number(),
	values: z.number().array(),
	version: z.literal(previewVersion),
});

interface ManifestOptions {
	dryRun?: boolean;
	rootPath: string;
}

// Runs after renditions and waveforms because it reads both of their outputs
export async function generateAudioManifest(options: ManifestOptions): Promise<void> {
	const { dryRun = false, rootPath } = options;

	const streamsPath = path.join(rootPath, streamsDir);
	const cacheDir = path.join(rootPath, waveformsCacheDir);
	const streamsOutputPath = path.resolve(rootPath, mixStreamsPath);
	const waveformsOutputPath = path.resolve(rootPath, mixWaveformsPath);

	const sources = await collectAudioSources(path.join(rootPath, audioSourceDir));
	const renditions = await collectRenditions(streamsPath);

	const streamEntries: Array<MixStreamEntry> = [];
	const waveformEntries: Array<MixWaveformEntry> = [];
	const incomplete: Array<string> = [];

	for (const source of sources) {
		const stream = renditions.get(source.base);
		const preview = await readPreview(path.join(cacheDir, `${source.base}${previewExtension}`));

		if (stream === undefined || preview === undefined) {
			incomplete.push(source.base);
			continue;
		}

		streamEntries.push({ base: source.base, stream });
		waveformEntries.push({
			base: source.base,
			peaks: preview.values,
			seconds: preview.seconds,
			sources: source.files,
		});
	}

	console.log(
		chalk.blue(
			`Manifest: ${String(streamEntries.length)} of ${String(sources.length)} mixes carry a rendition and a preview`,
		),
	);

	if (incomplete.length > 0) {
		console.warn(chalk.yellow(`  ${String(incomplete.length)} incomplete and left out:`));
		for (const base of incomplete) console.warn(chalk.yellow(`    ${base}`));
	}

	await assertManifestNotEmptied(streamEntries.length, rootPath);

	if (dryRun) {
		console.log(chalk.yellow(`  DRY RUN write: ${streamsOutputPath}`));
		console.log(chalk.yellow(`  DRY RUN write: ${waveformsOutputPath}`));
		return;
	}

	await fs.mkdir(path.dirname(streamsOutputPath), { recursive: true });
	await writeDocument(streamsOutputPath, streamEntries, mixStreamsVersion);
	await writeDocument(waveformsOutputPath, waveformEntries, mixWaveformsVersion);

	console.log(chalk.green(`Manifest written: ${streamsOutputPath}`));
	console.log(chalk.green(`Manifest written: ${waveformsOutputPath}`));
}

// The deploy probe needs a rendition filename, and the manifest is the only place one is written
export async function readManifestStreams(rootPath: string): Promise<Array<string>> {
	try {
		const raw: unknown = JSON.parse(
			await fs.readFile(path.resolve(rootPath, mixStreamsPath), 'utf8'),
		);

		return MixStreamsDocumentSchema.parse(raw).mixes.map((mix) => mix.stream);
	} catch {
		return [];
	}
}

// An audio directory that exists but is empty reads as zero sources rather than an error
async function assertManifestNotEmptied(count: number, rootPath: string): Promise<void> {
	if (count > 0) return;

	const existing = await readManifestStreams(rootPath);

	if (existing.length === 0) return;

	throw new Error(
		`Refusing to overwrite ${String(existing.length)} manifest entries with an empty manifest; no audio sources found in ${audioSourceDir}`,
	);
}

async function readPreview(file: string) {
	try {
		const parsed: unknown = JSON.parse(await fs.readFile(file, 'utf8'));

		return PreviewSchema.parse(parsed);
	} catch {
		return;
	}
}

// One row per line, so a diff names the mixes that changed; 400 peaks pretty-printed is 27k lines
async function writeDocument(
	outputPath: string,
	entries: Array<MixStreamEntry | MixWaveformEntry>,
	version: number,
): Promise<void> {
	const rows = entries.map((entry) => `\t\t${JSON.stringify(entry)}`).join(',\n');
	const document = `{\n\t"mixes": [\n${rows}\n\t],\n\t"version": ${String(version)}\n}\n`;
	const tmp = `${outputPath}${tmpExtension}`;

	await fs.writeFile(tmp, document, 'utf8');
	await fs.rename(tmp, outputPath);
}
