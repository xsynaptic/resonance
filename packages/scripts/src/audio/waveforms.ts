import { headerBytes, pairsPerRecord, recordBytes } from '@xsynaptic/plazmoid-wavedata';
import { WavedataFactsSchema } from '@xsynaptic/shared/schemas';
import fs from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';

import { analyzeMix } from '#audio/analysis.ts';
import { openWaveformsCache } from '#audio/audio-sources.ts';
import { collectHashedOutputs, landHashedOutput } from '#audio/hashed-outputs.ts';
import { runBatchStep } from '#shared/batch-run.ts';
import { hashFile, requireBinaries } from '#shared/utils.ts';

const concurrency = 6;
const wavedataExtension = '.wavedata';
const factsExtension = '.facts.json';
const tmpExtension = '.tmp';

const wavedataPattern = /^(?<base>.+)\.[0-9a-f]{12}\.wavedata$/;

// Bumped whenever the analysis or the stored shape changes; neither is visible in an mtime
const factsVersion = 9;

// Rejecting a stale shape here is what stops it reaching a page
const StoredWaveformSchema = z.object({
	facts: WavedataFactsSchema,
	file: z.string(),
	seconds: z.number(),
	version: z.literal(factsVersion),
});

export type StoredWaveform = z.infer<typeof StoredWaveformSchema>;

interface WaveformJob {
	base: string;
	file: string | undefined;
	source: string;
}

interface WaveformsOptions {
	dryRun?: boolean;
	rootPath: string;
}

export async function collectWavedata(cacheDir: string): Promise<Map<string, string>> {
	return collectHashedOutputs(cacheDir, wavedataPattern, 'waveform files');
}

export async function generateWaveforms(options: WaveformsOptions): Promise<void> {
	const { dryRun = false, rootPath } = options;

	const { cacheDir, sources } = await openWaveformsCache(rootPath, tmpExtension);
	const files = await collectWavedata(cacheDir);

	const jobs = sources.map((source): WaveformJob => ({
		base: source.base,
		file: files.get(source.base),
		source: source.path,
	}));

	const current = await Promise.all(jobs.map((job) => isWaveformCurrent(job, cacheDir)));
	const pending = jobs.filter((_, index) => current[index] !== true);

	await runBatchStep({
		concurrency,
		describe: (job) => `analyze: ${job.base}`,
		dryRun,
		label: 'Waveforms',
		noun: 'waveform',
		pending,
		// Below the plan, so a machine with nothing to analyze never fails a deploy over a missing binary
		prepare: async () => {
			if (pending.length === 0) return;

			await requireBinaries(['ffmpeg', 'ffprobe'], 'ffmpeg');
		},
		run: (job) => analyze(job, cacheDir),
		skipped: jobs.length - pending.length,
		verb: { infinitive: 'analyze', past: 'analyzed' },
	});
}

// `undefined` for a missing file as for a stale shape, since either way there is nothing to publish
export async function readStoredWaveform(
	cacheDir: string,
	base: string,
): Promise<StoredWaveform | undefined> {
	try {
		const parsed: unknown = JSON.parse(await fs.readFile(factsPath(cacheDir, base), 'utf8'));

		return StoredWaveformSchema.parse(parsed);
	} catch {
		return undefined;
	}
}

// The facts are written after the file they name, so an interrupted run reads as stale here
async function analyze(job: WaveformJob, cacheDir: string): Promise<string> {
	const analysis = await analyzeMix(job.source);
	const facts = WavedataFactsSchema.parse(analysis.facts);
	const tmp = path.join(cacheDir, `${job.base}${wavedataExtension}${tmpExtension}`);

	await fs.writeFile(tmp, analysis.file);

	const name = `${job.base}.${await hashFile(tmp)}${wavedataExtension}`;

	await landHashedOutput(tmp, cacheDir, { existing: job.file, name });

	const stored: StoredWaveform = {
		facts,
		file: name,
		seconds: analysis.seconds,
		version: factsVersion,
	};
	const target = factsPath(cacheDir, job.base);

	await fs.writeFile(`${target}${tmpExtension}`, `${JSON.stringify(stored)}\n`, 'utf8');
	await fs.rename(`${target}${tmpExtension}`, target);

	return name;
}

function factsPath(cacheDir: string, base: string): string {
	return path.join(cacheDir, `${base}${factsExtension}`);
}

async function isWaveformCurrent(job: WaveformJob, cacheDir: string): Promise<boolean> {
	if (job.file === undefined) return false;

	const stored = await readStoredWaveform(cacheDir, job.base);

	if (stored?.file !== job.file) return false;

	const expectedBytes =
		headerBytes + Math.ceil(stored.facts.pairCount / pairsPerRecord) * recordBytes(true);

	try {
		const [fileStat, sourceStat] = await Promise.all([
			fs.stat(path.join(cacheDir, job.file)),
			fs.stat(job.source),
		]);

		return fileStat.mtimeMs >= sourceStat.mtimeMs && fileStat.size === expectedBytes;
	} catch {
		return false;
	}
}
