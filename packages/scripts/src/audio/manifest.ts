import type { MixAudioEntry, StreamLoudness } from '@xsynaptic/shared/schemas';

import { log, withStep } from '@xsynaptic/astro-scripts';
import { mixAudioPath, waveformsCacheDir } from '@xsynaptic/shared/constants';
import { MixAudioDocumentSchema, mixAudioVersion } from '@xsynaptic/shared/schemas';
import fs from 'node:fs/promises';
import path from 'node:path';

import type { AudioSource } from '#audio/audio-sources.ts';

import { audioSourceDir, streamsDir } from '#audio/audio-paths.ts';
import { collectAudioSources } from '#audio/audio-sources.ts';
import { collectBands } from '#audio/bands.ts';
import { collectPeaks } from '#audio/peaks.ts';
import { collectRenditions, readRenditionLoudness } from '#audio/renditions.ts';
import { readOverview } from '#audio/waveforms.ts';
import { contentDataPath } from '#shared/content-path.ts';

const tmpExtension = '.tmp';

interface ManifestEntries {
	entries: Array<MixAudioEntry>;
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

	const text = `Manifest: ${String(entries.length)} of ${String(sourceCount)} mixes carry a rendition, peaks, bands and an overview`;

	await withStep(text, async () => {
		if (incomplete.length > 0) {
			log.warn(`${String(incomplete.length)} incomplete and left out:`);
			log.detail(incomplete.join('\n'));
		}

		await assertManifestNotEmptied(entries.length, rootPath);

		if (dryRun) {
			log.warn(`Dry run: not writing ${outputPath}`);
			return;
		}

		await fs.mkdir(path.dirname(outputPath), { recursive: true });
		await writeDocument(outputPath, entries);

		log.success(`Manifest written: ${outputPath}`);
	});
}

// The deploy probe needs a filename per location, and the manifest is the only place one is written
export async function readManifestFiles(
	rootPath: string,
): Promise<{ streams: Array<string>; waveformFiles: Array<string> }> {
	try {
		const raw: unknown = JSON.parse(
			await fs.readFile(path.resolve(rootPath, contentDataPath, mixAudioPath), 'utf8'),
		);
		const { mixes } = MixAudioDocumentSchema.parse(raw);

		return {
			streams: mixes.map((mix) => mix.stream),
			waveformFiles: mixes.flatMap((mix) => [mix.peaks, mix.bands]),
		};
	} catch {
		return { streams: [], waveformFiles: [] };
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
	const peakFiles = await collectPeaks(cacheDir);
	const bandFiles = await collectBands(cacheDir);

	const entries: Array<MixAudioEntry> = [];
	const incomplete: Array<string> = [];

	for (const source of sources) {
		const stream = renditions.get(source.base);
		const entry = await resolveEntry({
			bands: bandFiles.get(source.base),
			cacheDir,
			loudness:
				stream === undefined
					? undefined
					: await readRenditionLoudness(path.join(rootPath, streamsDir, stream)),
			peaks: peakFiles.get(source.base),
			source,
			stream,
		});

		if (entry) entries.push(entry);
		else incomplete.push(source.base);
	}

	return { entries, incomplete, sourceCount: sources.length };
}

// A mix missing its rendition, loudness tags, peaks, bands or overview is left out rather than half-published
async function resolveEntry({
	bands,
	cacheDir,
	loudness,
	peaks,
	source,
	stream,
}: {
	bands: string | undefined;
	cacheDir: string;
	loudness: StreamLoudness | undefined;
	peaks: string | undefined;
	source: AudioSource;
	stream: string | undefined;
}): Promise<MixAudioEntry | undefined> {
	if (bands === undefined || loudness === undefined || peaks === undefined || stream === undefined)
		return undefined;

	const overview = await readOverview(cacheDir, source.base);
	if (overview === undefined) return undefined;

	return {
		bands,
		base: source.base,
		facts: overview.facts,
		loudness,
		overview: overview.values,
		peaks,
		seconds: overview.seconds,
		sources: source.files,
		stream,
	};
}

// One row per line, so a diff names the mixes that changed; a 400-value overview pretty-printed is 27k lines
async function writeDocument(outputPath: string, entries: Array<MixAudioEntry>): Promise<void> {
	const rows = entries.map((entry) => `\t\t${JSON.stringify(entry)}`).join(',\n');
	const document = `{\n\t"mixes": [\n${rows}\n\t],\n\t"version": ${String(mixAudioVersion)}\n}\n`;
	const tmp = `${outputPath}${tmpExtension}`;

	await fs.writeFile(tmp, document, 'utf8');
	await fs.rename(tmp, outputPath);
}
