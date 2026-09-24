import type { MixStreamEntry, MixWaveformEntry, StreamLoudness } from '@xsynaptic/shared/schemas';

import { mixStreamsPath, mixWaveformsPath } from '@xsynaptic/shared/constants';
import {
	MixStreamsDocumentSchema,
	mixStreamsVersion,
	MixWaveformsDocumentSchema,
	mixWaveformsVersion,
} from '@xsynaptic/shared/schemas';
import chalk from 'chalk';
import fs from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';

import type { AudioSource } from '#audio/audio-sources.ts';

import { audioSourceDir, streamsDir, waveformsCacheDir } from '#audio/audio-paths.ts';
import { collectAudioSources } from '#audio/audio-sources.ts';
import { collectRenditions, readRenditionLoudness } from '#audio/renditions.ts';
import { collectArchives, previewVersion } from '#audio/waveforms.ts';
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
	// A source missing any one of its three outputs, named for the warning
	incomplete: Array<string>;
	sourceCount: number;
	streamEntries: Array<MixStreamEntry>;
	waveformEntries: Array<MixWaveformEntry>;
}

interface ManifestOptions {
	dryRun?: boolean;
	rootPath: string;
}

// Runs after renditions and waveforms because it reads both of their outputs
export async function generateAudioManifest(options: ManifestOptions): Promise<void> {
	const { dryRun = false, rootPath } = options;

	const streamsOutputPath = path.resolve(rootPath, contentDataPath, mixStreamsPath);
	const waveformsOutputPath = path.resolve(rootPath, contentDataPath, mixWaveformsPath);

	const { incomplete, sourceCount, streamEntries, waveformEntries } =
		await collectManifestEntries(rootPath);

	console.log(
		chalk.blue(
			`Manifest: ${String(streamEntries.length)} of ${String(sourceCount)} mixes carry a rendition, an archive and a preview`,
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

// The deploy probe needs a filename per location, and the manifests are the only place one is written
export async function readManifestFiles(
	rootPath: string,
): Promise<{ archives: Array<string>; streams: Array<string> }> {
	const [streams, waveforms] = await Promise.all([
		readManifest(rootPath, path.join(contentDataPath, mixStreamsPath), MixStreamsDocumentSchema),
		readManifest(
			rootPath,
			path.join(contentDataPath, mixWaveformsPath),
			MixWaveformsDocumentSchema,
		),
	]);

	return {
		archives: waveforms?.mixes.map((mix) => mix.archive) ?? [],
		streams: streams?.mixes.map((mix) => mix.stream) ?? [],
	};
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

	const streamEntries: Array<MixStreamEntry> = [];
	const waveformEntries: Array<MixWaveformEntry> = [];
	const incomplete: Array<string> = [];

	for (const source of sources) {
		const stream = renditions.get(source.base);
		const resolved = await resolveEntries({
			archive: archives.get(source.base),
			cacheDir,
			loudness:
				stream === undefined
					? undefined
					: await readRenditionLoudness(path.join(rootPath, streamsDir, stream)),
			source,
			stream,
		});

		if (!resolved) {
			incomplete.push(source.base);
			continue;
		}

		streamEntries.push(resolved.stream);
		waveformEntries.push(resolved.waveform);
	}

	return { incomplete, sourceCount: sources.length, streamEntries, waveformEntries };
}

// A missing or stale-version manifest reads as no files, which both callers handle
async function readManifest<Output>(
	rootPath: string,
	manifestPath: string,
	schema: z.ZodType<Output>,
): Promise<Output | undefined> {
	try {
		const raw: unknown = JSON.parse(
			await fs.readFile(path.resolve(rootPath, manifestPath), 'utf8'),
		);

		return schema.parse(raw);
	} catch {
		return undefined;
	}
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
async function resolveEntries({
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
}): Promise<undefined | { stream: MixStreamEntry; waveform: MixWaveformEntry }> {
	if (archive === undefined || loudness === undefined || stream === undefined) return undefined;

	const preview = await readPreview(path.join(cacheDir, `${source.base}${previewExtension}`));
	if (preview === undefined) return undefined;

	return {
		stream: { base: source.base, loudness, stream },
		waveform: {
			archive,
			base: source.base,
			peaks: preview.values,
			seconds: preview.seconds,
			sources: source.files,
		},
	};
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
