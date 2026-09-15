import type { StreamLoudness } from '@xsynaptic/shared/schemas';

import chalk from 'chalk';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import { $ } from 'zx';

import { audioSourceDir, streamsDir } from '#audio/audio-paths.ts';
import { collectAudioSources } from '#audio/audio-sources.ts';
import { collectHashedOutputs } from '#audio/hashed-outputs.ts';
import { measureLoudness } from '#audio/loudness.ts';
import { runBatchStep } from '#shared/batch-run.ts';
import { cleanStaleTmp, hashFile } from '#shared/utils.ts';

const concurrency = 3;
const renditionExtension = '.mp4';
const tmpExtension = '.mp4.tmp';

// 12 hex of a sha256 over the rendition's own bytes, so /stream/ can be served immutable
const renditionPattern = /^(?<base>.+)\.[0-9a-f]{12}\.mp4$/;

// Chrome clamps decoded samples before the page can attenuate them, so the file itself has to decode under this
const ceilingDbtp = -1;

// Room left for Opus overshoot on the first encode; nine full mixes overshot 0 to 1.6 dB
const seedMarginDb = 1.5;

// Overshoot drifts up to 0.2 dB as the gain changes, so a correction aims that far under the ceiling
const correctionMarginDb = 0.2;

// Every trial mix landed within two; a third miss means material unlike anything measured
const maxPasses = 3;

// Source tags carried over, matched case-insensitively; everything else is dropped
// The mastering chain's loudness, peak and analysis tags describe the master and turn false once the gain lands
// Its WAVEFORM tag alone was 139KB read before the first sample
const keptTags = new Set([
	'album',
	'artist',
	'catalog #',
	'date',
	'ensemble',
	'organization',
	'original artist',
	'performer',
	'publisher',
	'title',
	'track',
	'year',
]);

const containerArgs = [
	'-movflags', // Index ahead of the audio, so playback starts without a request to the tail; custom tags need mdta atoms
	'+faststart+use_metadata_tags',
	'-fflags', // Drops the mp4 creation time, so an unchanged re-encode keeps its content hash
	'+bitexact',
	'-flags:a',
	'+bitexact',
];

const encoderArgs = [
	'-vn', // Drops cover art, which would otherwise ride into the mp4 as a video track
	'-map_metadata', // The kept source tags are written back explicitly
	'-1',
	'-c:a',
	'libopus',
	'-b:a',
	'128k',
	...containerArgs,
];

// Stamped into every rendition and checked on the next run
// mtime can't see a settings change; without this an encoder, tag or loudness policy edit leaves old encodes in place
const encoderArgsHash = crypto
	.createHash('sha256')
	.update(
		[
			...encoderArgs,
			...keptTags,
			gainFilter(0),
			ceilingDbtp,
			seedMarginDb,
			correctionMarginDb,
			maxPasses,
		].join(' '),
	)
	.digest('hex')
	.slice(0, 12);

const FormatTagsSchema = z.object({
	format: z.object({ tags: z.record(z.string(), z.string()).optional() }),
});

// Every stale rendition probes, so only the first failure is worth a line
let hasReportedProbeFailure = false;

interface RenditionJob {
	base: string;
	existing: string | undefined;
	source: string;
}

interface RenditionsOptions {
	dryRun?: boolean;
	rootPath: string;
}

interface VerifiedEncode extends StreamLoudness {
	gainDb: number;
	pass: number;
}

// Exported for the manifest step, which has to name the file the player will request
export async function collectRenditions(streamsPath: string): Promise<Map<string, string>> {
	return collectHashedOutputs(streamsPath, renditionPattern, 'renditions');
}

// 128kbps Opus .mp4 streaming renditions per source (FLAC preferred, MP3 fallback)
// Each decodes at or under the true-peak ceiling: a linear gain seeded from the source, verified by decoding, corrected on a miss
// Incremental: skips outputs newer than their source and stamped with the current encoder args hash
// Atomic: encodes to a tmp file then renames onto the hashed name
export async function generateRenditions(options: RenditionsOptions): Promise<void> {
	const { dryRun = false, rootPath } = options;

	// ffprobe too: it reads the hash deciding what is pending, so without it every file re-encodes
	for (const binary of ['ffmpeg', 'ffprobe']) {
		try {
			await $`which ${binary}`.quiet();
		} catch {
			throw new Error(`${binary} not found on PATH. Install it with: brew install ffmpeg`);
		}
	}

	const streamsPath = path.join(rootPath, streamsDir);
	const sources = await collectAudioSources(path.join(rootPath, audioSourceDir));

	await fs.mkdir(streamsPath, { recursive: true });
	await cleanStaleTmp(streamsPath, tmpExtension);

	const renditions = await collectRenditions(streamsPath);

	const jobs = sources.map((source): RenditionJob => ({
		base: source.base,
		existing: renditions.get(source.base),
		source: source.path,
	}));

	const upToDate = await Promise.all(jobs.map((job) => isUpToDate(job, streamsPath)));
	const pending = jobs.filter((_, index) => upToDate[index] !== true);

	await runBatchStep({
		concurrency,
		describe: (job) => `encode: ${path.basename(job.source)} -> ${job.base}`,
		dryRun,
		label: 'Renditions',
		noun: 'rendition',
		pending,
		run: (job) => encode(job, streamsPath),
		skipped: jobs.length - pending.length,
		verb: { infinitive: 'encode', past: 'encoded' },
	});
}

// The manifest carries these to the player, so its normalization works from what it will actually decode
// A rendition without them predates the verified encode
export async function readRenditionLoudness(output: string): Promise<StreamLoudness | undefined> {
	const tags = await readRenditionTags(output);
	const integratedLufs = Number(tags.LOUDNESS_INTEGRATED_LUFS);
	const truePeakDbtp = Number(tags.LOUDNESS_TRUE_PEAK_DBTP);

	if (!Number.isFinite(integratedLufs) || !Number.isFinite(truePeakDbtp)) return undefined;

	return { integratedLufs, truePeakDbtp };
}

// Returns the rendition's filename, which the caller cannot predict: it names the encoded bytes
async function encode(job: RenditionJob, streamsPath: string): Promise<string> {
	const tmp = tmpPath(streamsPath, job.base);
	const [source, sourceTags] = await Promise.all([
		measureLoudness(job.source),
		readFormatTags(job.source),
	]);

	const tagArgs = Object.entries(sourceTags)
		.filter(([key]) => keptTags.has(key.toLowerCase()))
		.flatMap(([key, value]) => ['-metadata', `${key}=${value}`]);

	let gainDb = roundDb(Math.min(0, ceilingDbtp - source.truePeakDbtp - seedMarginDb));

	for (let pass = 1; pass <= maxPasses; pass += 1) {
		// -f mp4 is explicit because the .tmp suffix hides the container format
		await $`ffmpeg -nostdin -hide_banner -loglevel error -y -i ${job.source} -af ${gainFilter(gainDb)} ${encoderArgs} ${tagArgs} -f mp4 ${tmp}`;

		const decoded = await measureLoudness(tmp);

		if (decoded.truePeakDbtp <= ceilingDbtp) {
			const name = await land(job, streamsPath, { ...decoded, gainDb, pass });

			return `${name} (gain ${String(gainDb)} dB, pass ${String(pass)}, ${String(decoded.truePeakDbtp)} dBTP, ${String(decoded.integratedLufs)} LUFS)`;
		}

		// Accumulates, since overshoot rides on top of whatever gain produced it
		gainDb = roundDb(gainDb + ceilingDbtp - decoded.truePeakDbtp - correctionMarginDb);
	}

	await fs.rm(tmp, { force: true });

	throw new Error(
		`${job.base}: decoded true peak still above ${String(ceilingDbtp)} dBTP after ${String(maxPasses)} passes`,
	);
}

// Float end to end, so neither the gain nor the 48k resample can clip before the codec sees the signal
function gainFilter(gainDb: number): string {
	return `aformat=sample_fmts=flt,volume=${String(gainDb)}dB,aresample=48000,aformat=sample_fmts=flt:sample_rates=48000`;
}

async function isUpToDate(job: RenditionJob, streamsPath: string): Promise<boolean> {
	if (job.existing === undefined) return false;

	const output = path.join(streamsPath, job.existing);

	try {
		const [sourceStat, outputStat] = await Promise.all([fs.stat(job.source), fs.stat(output)]);
		if (outputStat.mtimeMs < sourceStat.mtimeMs) return false;
	} catch {
		return false;
	}

	const tags = await readRenditionTags(output);

	return tags.ENCODER_ARGS_HASH === encoderArgsHash;
}

// The decoded values exist only after the verify pass, so the tags go on with a stream copy rather than at encode
async function land(
	job: RenditionJob,
	streamsPath: string,
	verified: VerifiedEncode,
): Promise<string> {
	const tmp = tmpPath(streamsPath, job.base);
	const tagged = tmpPath(streamsPath, `${job.base}.tagged`);

	// The demuxer reports the brand boxes as tags, which the copy would write back beside the real ones
	await $`ffmpeg -nostdin -hide_banner -loglevel error -y -i ${tmp} -map 0 -c copy -map_metadata 0 ${[
		'-metadata',
		'major_brand=',
		'-metadata',
		'minor_version=',
		'-metadata',
		'compatible_brands=',
		'-metadata',
		`ENCODER_ARGS_HASH=${encoderArgsHash}`,
		'-metadata',
		`RENDITION_GAIN_DB=${String(verified.gainDb)}`,
		'-metadata',
		`RENDITION_PASSES=${String(verified.pass)}`,
		'-metadata',
		`LOUDNESS_INTEGRATED_LUFS=${String(verified.integratedLufs)}`,
		'-metadata',
		`LOUDNESS_TRUE_PEAK_DBTP=${String(verified.truePeakDbtp)}`,
	]} ${containerArgs} -f mp4 ${tagged}`;
	await fs.rm(tmp);

	const name = `${job.base}.${await hashFile(tagged)}${renditionExtension}`;

	await fs.rename(tagged, path.join(streamsPath, name));

	// The previous hash is unreachable the moment this one lands; the stream leg reaps its remote twin
	if (job.existing !== undefined && job.existing !== name) {
		await fs.rm(path.join(streamsPath, job.existing), { force: true });
	}

	return name;
}

async function readFormatTags(file: string): Promise<Record<string, string>> {
	const result = await $`ffprobe -v error -show_entries format_tags -of json ${file}`.quiet();

	return FormatTagsSchema.parse(JSON.parse(result.stdout)).format.tags ?? {};
}

// Reads only the header, which faststart keeps at the front of the file
// An empty result marks the rendition stale, so the first failure is reported rather than swallowed
async function readRenditionTags(output: string): Promise<Record<string, string>> {
	try {
		return await readFormatTags(output);
	} catch (error) {
		if (!hasReportedProbeFailure) {
			hasReportedProbeFailure = true;
			console.warn(
				chalk.yellow(
					`  ffprobe failed on ${path.basename(output)}; treating as stale: ${String(error)}`,
				),
			);
		}
		return {};
	}
}

function roundDb(value: number): number {
	return Math.round(value * 100) / 100;
}

function tmpPath(streamsPath: string, base: string): string {
	return path.join(streamsPath, `${base}${tmpExtension}`);
}
