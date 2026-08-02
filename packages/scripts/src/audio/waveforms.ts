import chalk from 'chalk';
import fs from 'node:fs/promises';
import path from 'node:path';
import pLimit from 'p-limit';
import { $ } from 'zx';

import { AUDIO_SOURCE_DIR, WAVEFORMS_CACHE_DIR } from './audio-paths.js';
import { collectAudioSources } from './audio-sources.js';

const CONCURRENCY = 6;
const ARCHIVE_EXTENSION = '.dat';
const PREVIEW_EXTENSION = '.json';
const TMP_EXTENSION = '.tmp';

const HEADER_BYTES = 20;
const ARCHIVE_VERSION = 1;
const EIGHT_BIT_FLAG = 1;
const SAMPLES_PER_PIXEL = 256;

const PREVIEW_VERSION = 1;
const PREVIEW_BUCKETS = 2000;
const PREVIEW_SCALE = 255;

export interface WaveformHeader {
	pairs: number;
	sampleRate: number;
	samplesPerPixel: number;
}

export interface WaveformPreview {
	seconds: number;
	values: Array<number>;
	version: number;
}

interface WaveformJob {
	archive: string;
	preview: string;
	source: string;
}

interface WaveformsOptions {
	dryRun?: boolean;
	rootPath: string;
}

// Reduces the archive to at most 2000 buckets of 0..255, ready to inline
// Per pair take the envelope amplitude, per bucket take the RMS of those amplitudes: a peak-per-bucket
// envelope renders a featureless rectangle on a mastered mix, where every bucket holds a full-scale transient
// Values are normalized here rather than in a renderer, so consumers never need to know the source units
export function distillWaveform(buffer: Buffer): WaveformPreview {
	const { pairs, sampleRate, samplesPerPixel } = parseWaveformHeader(buffer);
	if (buffer.length < HEADER_BYTES + pairs * 2) throw new Error('Waveform data is truncated');

	const bucketCount = Math.min(PREVIEW_BUCKETS, pairs);
	const buckets: Array<number> = [];
	let peak = 0;

	for (let bucket = 0; bucket < bucketCount; bucket += 1) {
		const start = Math.floor((bucket * pairs) / bucketCount);
		const end = Math.max(Math.floor(((bucket + 1) * pairs) / bucketCount), start + 1);
		let sumOfSquares = 0;

		for (let pair = start; pair < end; pair += 1) {
			const offset = HEADER_BYTES + pair * 2;
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

	const values = buckets.map((rms) => (peak > 0 ? Math.round((rms / peak) * PREVIEW_SCALE) : 0));

	return {
		seconds: Math.round(((pairs * samplesPerPixel) / sampleRate) * 10) / 10,
		values,
		version: PREVIEW_VERSION,
	};
}

// Two tiers from one analysis pass: a full-resolution `.dat` archive and a distilled preview
// Both land in `.cache/`; they are regenerable intermediates and nothing deploys them
export async function generateWaveforms(options: WaveformsOptions): Promise<void> {
	const { dryRun = false, rootPath } = options;

	try {
		await $`which audiowaveform`.quiet();
	} catch {
		throw new Error('audiowaveform not found on PATH. Install it with: brew install audiowaveform');
	}

	const cacheDir = path.join(rootPath, WAVEFORMS_CACHE_DIR);
	const sources = await collectAudioSources(path.join(rootPath, AUDIO_SOURCE_DIR));

	const jobs = sources.map((source): WaveformJob => ({
		archive: path.join(cacheDir, `${source.base}${ARCHIVE_EXTENSION}`),
		preview: path.join(cacheDir, `${source.base}${PREVIEW_EXTENSION}`),
		source: source.path,
	}));

	await fs.mkdir(cacheDir, { recursive: true });
	await cleanStaleTmp(cacheDir);

	const plans = await Promise.all(jobs.map(planJob));
	const pending = jobs
		.map((job, index) => ({ job, plan: plans[index] ?? 'analyze' }))
		.filter((entry) => entry.plan !== 'skip');
	const skipped = jobs.length - pending.length;

	console.log(
		chalk.blue(
			`Waveforms: ${String(jobs.length)} total, ${String(skipped)} up to date, ${String(pending.length)} to derive`,
		),
	);

	if (dryRun) {
		for (const { job, plan } of pending) {
			console.log(chalk.yellow(`  DRY RUN ${plan}: ${path.basename(job.archive)}`));
		}
		return;
	}

	const limit = pLimit(CONCURRENCY);
	let done = 0;

	const results = await Promise.allSettled(
		pending.map(({ job, plan }) =>
			limit(async () => {
				if (plan === 'analyze') await analyze(job);
				await distill(job);
				done += 1;
				console.log(
					chalk.green(
						`  [${String(done)}/${String(pending.length)}] ${path.basename(job.preview)}`,
					),
				);
			}),
		),
	);

	const failures = results.filter(
		(result): result is PromiseRejectedResult => result.status === 'rejected',
	);

	if (failures.length > 0) {
		for (const failure of failures)
			console.error(chalk.red(`  waveform failed: ${String(failure.reason)}`));
		throw new Error(`${String(failures.length)} waveform(s) failed to derive`);
	}

	console.log(
		chalk.green(
			`Waveforms complete: ${String(pending.length)} derived, ${String(skipped)} unchanged`,
		),
	);
}

// Header layout, little-endian: version, flags, sample_rate, samples_per_pixel, length in min/max PAIRS
// Self-describing, so freshness needs no external version constant; anything unexpected regenerates
export function parseWaveformHeader(buffer: Buffer): WaveformHeader {
	if (buffer.length < HEADER_BYTES) throw new Error('Waveform data is shorter than its header');

	const version = buffer.readInt32LE(0);
	if (version !== ARCHIVE_VERSION) {
		throw new Error(
			`Waveform data is version ${String(version)}, expected ${String(ARCHIVE_VERSION)}`,
		);
	}

	const flags = buffer.readUInt32LE(4);
	if (flags !== EIGHT_BIT_FLAG) {
		throw new Error(`Waveform data is not 8-bit (flags ${String(flags)})`);
	}

	const samplesPerPixel = buffer.readInt32LE(12);
	if (samplesPerPixel !== SAMPLES_PER_PIXEL) {
		throw new Error(
			`Waveform data is ${String(samplesPerPixel)} samples per pixel, expected ${String(SAMPLES_PER_PIXEL)}`,
		);
	}

	return { pairs: buffer.readUInt32LE(16), sampleRate: buffer.readInt32LE(8), samplesPerPixel };
}

async function analyze(job: WaveformJob): Promise<void> {
	const tmp = `${job.archive}${TMP_EXTENSION}`;

	// --output-format is explicit because the .tmp suffix hides the format
	// No --amplitude-scale: the archive keeps true peaks and normalization happens at distillation
	await $`audiowaveform -q -i ${job.source} -o ${tmp} --output-format dat -z ${String(SAMPLES_PER_PIXEL)} -b 8`;

	await fs.rename(tmp, job.archive);
}

// Interrupted runs leave `.tmp` files behind; clear them so none masquerade as complete
async function cleanStaleTmp(dir: string): Promise<void> {
	let existing: Array<string>;

	try {
		existing = await fs.readdir(dir);
	} catch {
		return;
	}

	await Promise.all(
		existing
			.filter((name) => name.endsWith(TMP_EXTENSION))
			.map((name) => fs.rm(path.join(dir, name), { force: true })),
	);
}

async function distill(job: WaveformJob): Promise<void> {
	const preview = distillWaveform(await fs.readFile(job.archive));
	const tmp = `${job.preview}${TMP_EXTENSION}`;

	await fs.writeFile(tmp, `${JSON.stringify(preview)}\n`, 'utf8');
	await fs.rename(tmp, job.preview);
}

async function isArchiveCurrent(source: string, archive: string): Promise<boolean> {
	if (!(await isNewerThan(archive, source))) return false;

	// Reads the 20-byte header alone, never the whole 4MB archive
	// A stale zoom level or bit depth reads as not current, which is why no external version constant is needed
	try {
		const handle = await fs.open(archive, 'r');

		try {
			const header = Buffer.alloc(HEADER_BYTES);
			const { bytesRead } = await handle.read(header, 0, HEADER_BYTES, 0);
			if (bytesRead < HEADER_BYTES) return false;

			parseWaveformHeader(header);
			return true;
		} finally {
			await handle.close();
		}
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

async function planJob(job: WaveformJob): Promise<'analyze' | 'distill' | 'skip'> {
	if (!(await isArchiveCurrent(job.source, job.archive))) return 'analyze';
	if (!(await isNewerThan(job.preview, job.archive))) return 'distill';
	return 'skip';
}
