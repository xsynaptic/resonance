import type { MixAudioEntry } from '@xsynaptic/shared/schemas';

import { mixAudioPath } from '@xsynaptic/shared/constants';
import { MixAudioDocumentSchema, mixAudioVersion } from '@xsynaptic/shared/schemas';
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
	const outputPath = path.resolve(rootPath, mixAudioPath);

	const sources = await collectAudioSources(path.join(rootPath, audioSourceDir));
	const renditions = await collectRenditions(streamsPath);

	const mixes: Array<MixAudioEntry> = [];
	const incomplete: Array<string> = [];

	for (const source of sources) {
		const stream = renditions.get(source.base);
		const preview = await readPreview(path.join(cacheDir, `${source.base}${previewExtension}`));

		if (stream === undefined || preview === undefined) {
			incomplete.push(source.base);
			continue;
		}

		mixes.push({
			base: source.base,
			peaks: preview.values,
			seconds: preview.seconds,
			sources: source.files,
			stream,
		});
	}

	console.log(
		chalk.blue(
			`Manifest: ${String(mixes.length)} of ${String(sources.length)} mixes carry a rendition and a preview`,
		),
	);

	if (incomplete.length > 0) {
		console.warn(chalk.yellow(`  ${String(incomplete.length)} incomplete and left out:`));
		for (const base of incomplete) console.warn(chalk.yellow(`    ${base}`));
	}

	await assertManifestNotEmptied(mixes.length, rootPath);

	if (dryRun) {
		console.log(chalk.yellow(`  DRY RUN write: ${outputPath}`));
		return;
	}

	await fs.mkdir(path.dirname(outputPath), { recursive: true });
	await writeManifest(outputPath, mixes);

	console.log(chalk.green(`Manifest written: ${outputPath}`));
}

// The deploy probe needs a rendition filename, and the manifest is the only place one is written
export async function readManifestStreams(rootPath: string): Promise<Array<string>> {
	try {
		const raw: unknown = JSON.parse(
			await fs.readFile(path.resolve(rootPath, mixAudioPath), 'utf8'),
		);

		return MixAudioDocumentSchema.parse(raw).mixes.map((mix) => mix.stream);
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

// One line per mix, so a diff names the mixes that changed; 400 peaks pretty-printed is 27k lines
async function writeManifest(outputPath: string, mixes: Array<MixAudioEntry>): Promise<void> {
	const rows = mixes.map((mix) => `\t\t${JSON.stringify(mix)}`).join(',\n');
	const document = `{\n\t"mixes": [\n${rows}\n\t],\n\t"version": ${String(mixAudioVersion)}\n}\n`;
	const tmp = `${outputPath}${tmpExtension}`;

	await fs.writeFile(tmp, document, 'utf8');
	await fs.rename(tmp, outputPath);
}
