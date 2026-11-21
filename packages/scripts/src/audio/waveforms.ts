import {
	bandCount,
	bandsHeaderBytes,
	peaksFieldCount,
	peaksFullScale,
	peaksHeaderBytes,
	samplesPerPair,
} from '@xsynaptic/shared/waveform-format';
import fs from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';

import type { MixAnalysis } from '#audio/analysis.ts';

import { analyzeMix } from '#audio/analysis.ts';
import { openWaveformsCache } from '#audio/audio-sources.ts';
import { bandMedians, bandsRole, collectBands, readBandsHeader } from '#audio/bands.ts';
import { landHashedOutput } from '#audio/hashed-outputs.ts';
import { collectPeaks, parsePeaksHeader, peaksRole, readPeaksHeader } from '#audio/peaks.ts';
import { runBatchStep } from '#shared/batch-run.ts';
import { hashFile, requireBinaries } from '#shared/utils.ts';

const concurrency = 6;
// One extension for both binaries; the role in the name says which is which
const binaryExtension = '.bin';
const overviewExtension = '.overview.json';
const tmpExtension = '.tmp';

// Bumped whenever the bucket count, the output range or the source values change; none is visible in an mtime
const overviewVersion = 6;
const overviewBuckets = 400;
const overviewFullScale = 255;

// sonic-ui's contract for a tint's energy: these percentiles of the levels above -60 dBFS
const rangeFloor = peaksFullScale * 10 ** (-60 / 20);
const quietShare = 0.1;
const loudShare = 0.95;

const LevelRangeSchema = z.tuple([z.number(), z.number()]);

// Rejecting a stale shape here is what stops it reaching a page
const OverviewSchema = z.object({
	medians: z.number().array(),
	rmsRange: LevelRangeSchema,
	seconds: z.number(),
	values: z.string(),
	version: z.literal(overviewVersion),
});

export type WaveformOverview = z.infer<typeof OverviewSchema>;

type LevelRange = z.infer<typeof LevelRangeSchema>;

export interface DistilledPeaks {
	// In the Peaks' Int8 units
	rmsRange: LevelRange;
	seconds: number;
	// One byte per bucket, 255 at the loudest
	values: Buffer;
}

interface WaveformJob {
	bands: string | undefined;
	base: string;
	overview: string;
	peaks: string | undefined;
	source: string;
}

interface WaveformsOptions {
	dryRun?: boolean;
	rootPath: string;
}

// Per bucket the RMS of its pairs' RMS, which is the RMS of its samples
// Values are normalized here rather than in a renderer, so consumers never need the source units
export function distillWaveform(buffer: Buffer): DistilledPeaks {
	const { pairCount: pairs, sampleRate } = parsePeaksHeader(buffer);
	if (buffer.length < peaksHeaderBytes + pairs * peaksFieldCount)
		throw new Error('Peaks are truncated');

	const bucketCount = Math.min(overviewBuckets, pairs);
	const buckets: Array<number> = [];
	const pairRms = new Float32Array(pairs);
	let peak = 0;

	for (let bucket = 0; bucket < bucketCount; bucket += 1) {
		const start = Math.floor((bucket * pairs) / bucketCount);
		const end = Math.max(Math.floor(((bucket + 1) * pairs) / bucketCount), start + 1);
		let sumOfSquares = 0;

		for (let pair = start; pair < end; pair += 1) {
			const rms = buffer.readInt8(peaksHeaderBytes + pair * peaksFieldCount + 2);

			pairRms[pair] = rms;
			sumOfSquares += rms * rms;
		}

		const rms = Math.sqrt(sumOfSquares / (end - start));
		if (rms > peak) peak = rms;
		buckets.push(rms);
	}

	return {
		rmsRange: levelRange(pairRms),
		seconds: Math.round(((pairs * samplesPerPair) / sampleRate) * 10) / 10,
		values: Buffer.from(
			buckets.map((rms) => (peak > 0 ? Math.round((rms / peak) * overviewFullScale) : 0)),
		),
	};
}

// All three land in `.cache/` and are regenerable; `deploy-audio` ships the first two, the overviews only feed the manifest
export async function generateWaveforms(options: WaveformsOptions): Promise<void> {
	const { dryRun = false, rootPath } = options;

	const { cacheDir, sources } = await openWaveformsCache(rootPath, tmpExtension);
	const [peakFiles, bandFiles] = await Promise.all([
		collectPeaks(cacheDir),
		collectBands(cacheDir),
	]);

	const jobs = sources.map((source): WaveformJob => ({
		bands: bandFiles.get(source.base),
		base: source.base,
		overview: overviewPath(cacheDir, source.base),
		peaks: peakFiles.get(source.base),
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

			await requireBinaries(['ffmpeg', 'ffprobe'], 'ffmpeg');
		},
		run: async ({ job, plan }) => {
			const analysis =
				plan === 'analyze' ? await analyze(job, cacheDir) : await readAnalysis(job, cacheDir);

			await distill(job, analysis);

			return path.basename(job.overview);
		},
		skipped: jobs.length - pending.length,
		verb: { infinitive: 'derive', past: 'derived' },
	});
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

async function analyze(job: WaveformJob, cacheDir: string): Promise<MixAnalysis> {
	const analysis = await analyzeMix(job.source);

	await Promise.all([
		landAnalysis(cacheDir, job.base, {
			bytes: analysis.peaks,
			existing: job.peaks,
			role: peaksRole,
		}),
		landAnalysis(cacheDir, job.base, {
			bytes: analysis.bands,
			existing: job.bands,
			role: bandsRole,
		}),
	]);

	return analysis;
}

async function distill(job: WaveformJob, { bands, peaks }: MixAnalysis): Promise<void> {
	const { rmsRange, seconds, values } = distillWaveform(peaks);
	const overview: WaveformOverview = {
		medians: bandMedians(bands),
		rmsRange,
		seconds,
		values: values.toString('base64'),
		version: overviewVersion,
	};
	const tmp = `${job.overview}${tmpExtension}`;

	await fs.writeFile(tmp, `${JSON.stringify(overview)}\n`, 'utf8');
	await fs.rename(tmp, job.overview);
}

// A stale rate or layout reads as not current through the header, so no external version constant is needed
async function isAnalysisCurrent(job: WaveformJob, cacheDir: string): Promise<boolean> {
	if (job.peaks === undefined || job.bands === undefined) return false;

	const peaks = path.join(cacheDir, job.peaks);
	const bands = path.join(cacheDir, job.bands);

	try {
		const [peaksStat, bandsStat, sourceStat, peaksHeader, bandsHeader] = await Promise.all([
			fs.stat(peaks),
			fs.stat(bands),
			fs.stat(job.source),
			readPeaksHeader(peaks),
			readBandsHeader(bands),
		]);

		return (
			peaksStat.mtimeMs >= sourceStat.mtimeMs &&
			bandsStat.mtimeMs >= sourceStat.mtimeMs &&
			peaksStat.size === peaksHeaderBytes + peaksHeader.pairCount * peaksFieldCount &&
			bandsStat.size === bandsHeaderBytes + bandsHeader.frameCount * bandCount
		);
	} catch {
		return false;
	}
}

async function isOverviewCurrent(
	job: WaveformJob,
	cacheDir: string,
	sources: Array<string>,
): Promise<boolean> {
	try {
		const [overviewStat, ...sourceStats] = await Promise.all(
			[job.overview, ...sources].map((file) => fs.stat(file)),
		);

		if (sourceStats.some((source) => (overviewStat?.mtimeMs ?? 0) < source.mtimeMs)) return false;
	} catch {
		return false;
	}

	// A bucket count or range change leaves the mtimes untouched, so the stored version is the check
	return (await readOverview(cacheDir, job.base)) !== undefined;
}

async function landAnalysis(
	cacheDir: string,
	base: string,
	{ bytes, existing, role }: { bytes: Buffer; existing: string | undefined; role: string },
): Promise<void> {
	const tmp = path.join(cacheDir, `${base}.${role}${binaryExtension}${tmpExtension}`);

	await fs.writeFile(tmp, bytes);
	await landHashedOutput(tmp, cacheDir, {
		existing,
		name: `${base}.${role}.${await hashFile(tmp)}${binaryExtension}`,
	});
}

// Nearest rank; a stored Int8 RMS of 1 is already -42 dBFS, so on the pairs the floor admits every non-zero value
function levelRange(levels: Float32Array): LevelRange {
	const sounding = levels.filter((level) => level > rangeFloor).toSorted();
	if (sounding.length === 0) return [0, 0];

	const at = (share: number) => sounding[Math.max(0, Math.ceil(share * sounding.length) - 1)] ?? 0;

	return [at(quietShare), at(loudShare)];
}

function overviewPath(cacheDir: string, base: string): string {
	return path.join(cacheDir, `${base}${overviewExtension}`);
}

async function planJob(
	job: WaveformJob,
	cacheDir: string,
): Promise<'analyze' | 'distill' | 'skip'> {
	if (job.peaks === undefined || job.bands === undefined) return 'analyze';
	if (!(await isAnalysisCurrent(job, cacheDir))) return 'analyze';

	const sources = [path.join(cacheDir, job.peaks), path.join(cacheDir, job.bands)];

	return (await isOverviewCurrent(job, cacheDir, sources)) ? 'skip' : 'distill';
}

async function readAnalysis(job: WaveformJob, cacheDir: string): Promise<MixAnalysis> {
	if (job.peaks === undefined || job.bands === undefined) {
		throw new Error(`No peaks and bands on disk for "${job.base}"`);
	}

	const [peaks, bands] = await Promise.all([
		fs.readFile(path.join(cacheDir, job.peaks)),
		fs.readFile(path.join(cacheDir, job.bands)),
	]);

	return { bands, peaks };
}
