import fs from 'node:fs/promises';
import path from 'node:path';
import { $ } from 'zx';

import { audioSourceDir, waveformsCacheDir } from '#audio/audio-paths.ts';
import { collectAudioSources } from '#audio/audio-sources.ts';
import { collectHashedOutputs, landHashedOutput } from '#audio/hashed-outputs.ts';
import { runBatchStep } from '#shared/batch-run.ts';
import { cleanStaleTmp, hashFile } from '#shared/utils.ts';

const concurrency = 6;
const archiveExtension = '.dat';
const previewExtension = '.json';
const tmpExtension = '.tmp';

const archivePattern = /^(?<base>.+)\.[0-9a-f]{12}\.dat$/;

const headerBytes = 20;
const archiveVersion = 1;
const eightBitFlag = 1;
const expectedSamplesPerPixel = 256;

// Bumped whenever the bucket count or the output range changes; neither is visible in an mtime
export const previewVersion = 2;
const previewBuckets = 400;
const previewPrecision = 1000;

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
	base: string;
	existing: string | undefined;
	preview: string;
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
export function distillWaveform(buffer: Buffer): WaveformPreview {
	const { pairs, sampleRate, samplesPerPixel } = parseWaveformHeader(buffer);
	if (buffer.length < headerBytes + pairs * 2) throw new Error('Waveform data is truncated');

	const bucketCount = Math.min(previewBuckets, pairs);
	const buckets: Array<number> = [];
	let peak = 0;

	for (let bucket = 0; bucket < bucketCount; bucket += 1) {
		const start = Math.floor((bucket * pairs) / bucketCount);
		const end = Math.max(Math.floor(((bucket + 1) * pairs) / bucketCount), start + 1);
		let sumOfSquares = 0;

		for (let pair = start; pair < end; pair += 1) {
			const offset = headerBytes + pair * 2;
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
		peak > 0 ? Math.round((rms / peak) * previewPrecision) / previewPrecision : 0,
	);

	return {
		seconds: Math.round(((pairs * samplesPerPixel) / sampleRate) * 10) / 10,
		values,
		version: previewVersion,
	};
}

// Two tiers from one analysis pass: a full-resolution `.dat` archive and a distilled preview
// Both land in `.cache/`; they are regenerable intermediates and nothing deploys them
export async function generateWaveforms(options: WaveformsOptions): Promise<void> {
	const { dryRun = false, rootPath } = options;

	const cacheDir = path.join(rootPath, waveformsCacheDir);
	const sources = await collectAudioSources(path.join(rootPath, audioSourceDir));

	await fs.mkdir(cacheDir, { recursive: true });
	await cleanStaleTmp(cacheDir, tmpExtension);

	const archives = await collectArchives(cacheDir);

	const jobs = sources.map((source): WaveformJob => ({
		base: source.base,
		existing: archives.get(source.base),
		preview: path.join(cacheDir, `${source.base}${previewExtension}`),
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

			return path.basename(job.preview);
		},
		skipped: jobs.length - pending.length,
		verb: { infinitive: 'derive', past: 'derived' },
	});
}

// Header layout, little-endian: version, flags, sample_rate, samples_per_pixel, length in min/max PAIRS
// Self-describing, so freshness needs no external version constant; anything unexpected regenerates
export function parseWaveformHeader(buffer: Buffer): WaveformHeader {
	if (buffer.length < headerBytes) throw new Error('Waveform data is shorter than its header');

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

	return { pairs: buffer.readUInt32LE(16), sampleRate: buffer.readInt32LE(8), samplesPerPixel };
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
	const preview = distillWaveform(await fs.readFile(archive));
	const tmp = `${job.preview}${tmpExtension}`;

	await fs.writeFile(tmp, `${JSON.stringify(preview)}\n`, 'utf8');
	await fs.rename(tmp, job.preview);
}

async function isArchiveCurrent(source: string, archive: string): Promise<boolean> {
	if (!(await isNewerThan(archive, source))) return false;

	// Reads the 20-byte header alone, never the whole 4MB archive
	// A stale zoom level or bit depth reads as not current, so no external version constant is needed
	try {
		const handle = await fs.open(archive, 'r');

		try {
			const header = Buffer.alloc(headerBytes);
			const { bytesRead } = await handle.read(header, 0, headerBytes, 0);
			if (bytesRead < headerBytes) return false;

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

async function isPreviewCurrent(preview: string, archive: string): Promise<boolean> {
	if (!(await isNewerThan(preview, archive))) return false;

	// A bucket count or range change leaves the mtimes untouched, so the stored version is the check
	try {
		const parsed: unknown = JSON.parse(await fs.readFile(preview, 'utf8'));

		return (
			typeof parsed === 'object' &&
			parsed !== null &&
			'version' in parsed &&
			parsed.version === previewVersion
		);
	} catch {
		return false;
	}
}

async function planJob(
	job: WaveformJob,
	cacheDir: string,
): Promise<'analyze' | 'distill' | 'skip'> {
	if (job.existing === undefined) return 'analyze';

	const archive = path.join(cacheDir, job.existing);

	if (!(await isArchiveCurrent(job.source, archive))) return 'analyze';
	if (!(await isPreviewCurrent(job.preview, archive))) return 'distill';
	return 'skip';
}
