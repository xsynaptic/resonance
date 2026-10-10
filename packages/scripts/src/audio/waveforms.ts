import { peakArchiveHeaderBytes } from '@xsynaptic/shared/waveform-format';
import fs from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import { $ } from 'zx';

import { openWaveformsCache } from '#audio/audio-sources.ts';
import { collectHashedOutputs, landHashedOutput } from '#audio/hashed-outputs.ts';
import { runBatchStep } from '#shared/batch-run.ts';
import { hashFile, readFileHead } from '#shared/utils.ts';

const concurrency = 6;
const archiveExtension = '.dat';
const overviewExtension = '.json';
const tmpExtension = '.tmp';

const archivePattern = /^(?<base>.+)\.[0-9a-f]{12}\.dat$/;

const archiveVersion = 1;
const eightBitFlag = 1;
const expectedSamplesPerPixel = 256;

// Bumped whenever the bucket count or the output range changes; neither is visible in an mtime
const overviewVersion = 2;
const overviewBuckets = 400;
const overviewPrecision = 1000;

// Rejecting a stale shape here is what stops it reaching a page
const OverviewSchema = z.object({
	seconds: z.number(),
	values: z.number().array(),
	version: z.literal(overviewVersion),
});

export interface WaveformHeader {
	pairCount: number;
	sampleRate: number;
	samplesPerPixel: number;
}

export type WaveformOverview = z.infer<typeof OverviewSchema>;

interface WaveformJob {
	base: string;
	existing: string | undefined;
	overview: string;
	source: string;
}

interface WaveformsOptions {
	dryRun?: boolean;
	rootPath: string;
}

// Exported for the manifest step, which has to name the file the panel will range-request
export async function collectArchives(cacheDir: string): Promise<Map<string, string>> {
	return collectHashedOutputs(cacheDir, archivePattern, 'archives');
}

// Reduces the archive to at most 400 buckets of 0..1, ready to inline
// Per pair take the envelope amplitude, per bucket the RMS of those amplitudes
// Peak-per-bucket would render a featureless rectangle: a mastered mix peaks in every bucket
// Values are normalized here rather than in a renderer, so consumers never need the source units
export function distillWaveform(buffer: Buffer): WaveformOverview {
	const { pairCount: pairs, sampleRate, samplesPerPixel } = parseWaveformHeader(buffer);
	if (buffer.length < peakArchiveHeaderBytes + pairs * 2)
		throw new Error('Waveform data is truncated');

	const bucketCount = Math.min(overviewBuckets, pairs);
	const buckets: Array<number> = [];
	let peak = 0;

	for (let bucket = 0; bucket < bucketCount; bucket += 1) {
		const start = Math.floor((bucket * pairs) / bucketCount);
		const end = Math.max(Math.floor(((bucket + 1) * pairs) / bucketCount), start + 1);
		let sumOfSquares = 0;

		for (let pair = start; pair < end; pair += 1) {
			const offset = peakArchiveHeaderBytes + pair * 2;
			const amplitude = Math.max(
				Math.abs(buffer.readInt8(offset)),
				Math.abs(buffer.readInt8(offset + 1)),
			);
			sumOfSquares += amplitude * amplitude;
		}

		const rms = Math.sqrt(sumOfSquares / (end - start));
		if (rms > peak) peak = rms;
		buckets.push(rms);
	}

	const values = buckets.map((rms) =>
		peak > 0 ? Math.round((rms / peak) * overviewPrecision) / overviewPrecision : 0,
	);

	return {
		seconds: Math.round(((pairs * samplesPerPixel) / sampleRate) * 10) / 10,
		values,
		version: overviewVersion,
	};
}

// Two tiers from one analysis pass: a full-resolution `.dat` archive and a distilled overview
// Both land in `.cache/` and are regenerable; `deploy-audio` ships the archives, the overviews only feed the manifest
export async function generateWaveforms(options: WaveformsOptions): Promise<void> {
	const { dryRun = false, rootPath } = options;

	const { cacheDir, sources } = await openWaveformsCache(rootPath, tmpExtension);
	const archives = await collectArchives(cacheDir);

	const jobs = sources.map((source): WaveformJob => ({
		base: source.base,
		existing: archives.get(source.base),
		overview: overviewPath(cacheDir, source.base),
		source: source.path,
	}));

	const plans = await Promise.all(jobs.map((job) => planJob(job, cacheDir)));
	const pending = jobs
		.map((job, index) => ({ job, plan: plans[index] ?? 'analyze' }))
		.filter((entry) => entry.plan !== 'skip');

	await runBatchStep({
		concurrency,
		describe: ({ job, plan }) => `${plan}: ${job.base}`,
		dryRun,
		label: 'Waveforms',
		noun: 'waveform',
		pending,
		// Below the plan, so a machine with nothing to analyze never fails a deploy over a missing binary
		prepare: async () => {
			if (pending.every(({ plan }) => plan !== 'analyze')) return;

			try {
				await $`which audiowaveform`.quiet();
			} catch {
				throw new Error(
					'audiowaveform not found on PATH. Install it with: brew install audiowaveform',
				);
			}
		},
		run: async ({ job, plan }) => {
			const archive = plan === 'analyze' ? await analyze(job, cacheDir) : job.existing;
			if (archive === undefined) throw new Error(`No archive on disk for "${job.base}"`);

			await distill(job, path.join(cacheDir, archive));

			return path.basename(job.overview);
		},
		skipped: jobs.length - pending.length,
		verb: { infinitive: 'derive', past: 'derived' },
	});
}

// Header layout, little-endian: version, flags, sample_rate, samples_per_pixel, length in min/max PAIRS
// Self-describing, so freshness needs no external version constant; anything unexpected regenerates
export function parseWaveformHeader(buffer: Buffer): WaveformHeader {
	if (buffer.length < peakArchiveHeaderBytes)
		throw new Error('Waveform data is shorter than its header');

	const version = buffer.readInt32LE(0);
	if (version !== archiveVersion) {
		throw new Error(
			`Waveform data is version ${String(version)}, expected ${String(archiveVersion)}`,
		);
	}

	const flags = buffer.readUInt32LE(4);
	if (flags !== eightBitFlag) {
		throw new Error(`Waveform data is not 8-bit (flags ${String(flags)})`);
	}

	const samplesPerPixel = buffer.readInt32LE(12);
	if (samplesPerPixel !== expectedSamplesPerPixel) {
		throw new Error(
			`Waveform data is ${String(samplesPerPixel)} samples per pixel, expected ${String(expectedSamplesPerPixel)}`,
		);
	}

	return { pairCount: buffer.readUInt32LE(16), sampleRate: buffer.readInt32LE(8), samplesPerPixel };
}

// `undefined` for a missing file as for a stale shape, since either way there is nothing to publish
export async function readOverview(
	cacheDir: string,
	base: string,
): Promise<undefined | WaveformOverview> {
	try {
		const parsed: unknown = JSON.parse(await fs.readFile(overviewPath(cacheDir, base), 'utf8'));

		return OverviewSchema.parse(parsed);
	} catch {
		return undefined;
	}
}

export async function readWaveformHeader(archive: string): Promise<WaveformHeader> {
	return parseWaveformHeader(await readFileHead(archive, peakArchiveHeaderBytes));
}

// Returns the archive's filename, which the caller cannot predict: it names the analyzed bytes
async function analyze(job: WaveformJob, cacheDir: string): Promise<string> {
	const tmp = path.join(cacheDir, `${job.base}${archiveExtension}${tmpExtension}`);

	// --output-format is explicit because the .tmp suffix hides the format
	// No --amplitude-scale: the archive keeps true peaks and normalization happens at distillation
	await $`audiowaveform -q -i ${job.source} -o ${tmp} --output-format dat -z ${String(expectedSamplesPerPixel)} -b 8`;

	const name = `${job.base}.${await hashFile(tmp)}${archiveExtension}`;

	await landHashedOutput(tmp, cacheDir, { existing: job.existing, name });

	return name;
}

async function distill(job: WaveformJob, archive: string): Promise<void> {
	const overview = distillWaveform(await fs.readFile(archive));
	const tmp = `${job.overview}${tmpExtension}`;

	await fs.writeFile(tmp, `${JSON.stringify(overview)}\n`, 'utf8');
	await fs.rename(tmp, job.overview);
}

async function isArchiveCurrent(source: string, archive: string): Promise<boolean> {
	if (!(await isNewerThan(archive, source))) return false;

	// A stale zoom level or bit depth reads as not current, so no external version constant is needed
	try {
		await readWaveformHeader(archive);
		return true;
	} catch {
		return false;
	}
}

async function isNewerThan(candidate: string, reference: string): Promise<boolean> {
	try {
		const [candidateStat, referenceStat] = await Promise.all([
			fs.stat(candidate),
			fs.stat(reference),
		]);
		return candidateStat.mtimeMs >= referenceStat.mtimeMs;
	} catch {
		return false;
	}
}

async function isOverviewCurrent(
	job: WaveformJob,
	cacheDir: string,
	archive: string,
): Promise<boolean> {
	if (!(await isNewerThan(job.overview, archive))) return false;

	// A bucket count or range change leaves the mtimes untouched, so the stored version is the check
	return (await readOverview(cacheDir, job.base)) !== undefined;
}

function overviewPath(cacheDir: string, base: string): string {
	return path.join(cacheDir, `${base}${overviewExtension}`);
}

async function planJob(
	job: WaveformJob,
	cacheDir: string,
): Promise<'analyze' | 'distill' | 'skip'> {
	if (job.existing === undefined) return 'analyze';

	const archive = path.join(cacheDir, job.existing);

	if (!(await isArchiveCurrent(job.source, archive))) return 'analyze';
	if (!(await isOverviewCurrent(job, cacheDir, archive))) return 'distill';
	return 'skip';
}
