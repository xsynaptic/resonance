import chalk from 'chalk';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { $ } from 'zx';

import { audioSourceDir, streamsDir } from '#audio/audio-paths.ts';
import { collectAudioSources } from '#audio/audio-sources.ts';
import { runBatchStep } from '#shared/batch-run.ts';
import { cleanStaleTmp, hashFile } from '#shared/utils.ts';

const concurrency = 3;
const renditionExtension = '.webm';
const tmpExtension = '.webm.tmp';

// 12 hex of a sha256 over the rendition's own bytes, so /stream/ can be served immutable
const renditionPattern = /^(?<base>.+)\.[0-9a-f]{12}\.webm$/;

const encoderArgs = [
	'-vn', // Drops cover art; webm would otherwise re-encode the 6MB embedded image as a VP9 video track
	'-map_metadata', // Keeps tags, minus WAVEFORM, reducing time to first byte
	'0',
	'-metadata',
	'WAVEFORM=',
	'-c:a',
	'libopus',
	'-b:a',
	'128k',
	'-cues_to_front', // Puts the seek index before the clusters so a seek needs no round trip to the tail
	'1',
	'-fflags', // Drops the random webm track UID, so an unchanged re-encode keeps its content hash
	'+bitexact',
	'-flags:a',
	'+bitexact',
];

// Stamped into every rendition and checked on the next run
// mtime can't see a settings change; without this an encoderArgs edit leaves old encodes in place
const encoderArgsHash = crypto
	.createHash('sha256')
	.update(encoderArgs.join(' '))
	.digest('hex')
	.slice(0, 12);

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

// Exported for the manifest step, which has to name the file the player will request
export async function collectRenditions(streamsPath: string): Promise<Map<string, string>> {
	let entries: Array<string>;

	try {
		entries = await fs.readdir(streamsPath);
	} catch {
		return new Map();
	}

	const renditions = new Map<string, string>();

	for (const entry of entries) {
		const base = renditionPattern.exec(entry)?.groups?.base;

		if (base === undefined) continue;

		const existing = renditions.get(base);

		// An interrupted encode leaves both hashed files; keeping either one silently ships a stale stream name
		if (existing !== undefined) {
			throw new Error(
				`Two renditions for "${base}": ${existing} and ${entry}. Delete the stale one and re-run.`,
			);
		}

		renditions.set(base, entry);
	}

	return renditions;
}

// 128kbps Opus .webm streaming renditions per source (FLAC preferred, MP3 fallback)
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

// Returns the rendition's filename, which the caller cannot predict: it names the encoded bytes
async function encode(job: RenditionJob, streamsPath: string): Promise<string> {
	const tmp = path.join(streamsPath, `${job.base}${tmpExtension}`);

	// -f webm is explicit because the .tmp suffix hides the container format
	await $`ffmpeg -nostdin -hide_banner -loglevel error -y -i ${job.source} ${encoderArgs} -metadata ${`ENCODER_ARGS_HASH=${encoderArgsHash}`} -f webm ${tmp}`;

	const name = `${job.base}.${await hashFile(tmp)}${renditionExtension}`;

	await fs.rename(tmp, path.join(streamsPath, name));

	// The previous hash is unreachable the moment this one lands; the stream leg reaps its remote twin
	if (job.existing !== undefined && job.existing !== name) {
		await fs.rm(path.join(streamsPath, job.existing), { force: true });
	}

	return name;
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

	return (await readEncoderArgsHash(output)) === encoderArgsHash;
}

// Reads only the header, which -cues_to_front keeps at the front of the file
// An empty result marks the rendition stale, so the first failure is reported rather than swallowed
async function readEncoderArgsHash(output: string): Promise<string> {
	try {
		const result =
			await $`ffprobe -v error -show_entries format_tags=ENCODER_ARGS_HASH -of default=nw=1:nk=1 ${output}`.quiet();
		return result.stdout.trim();
	} catch (error) {
		if (!hasReportedProbeFailure) {
			hasReportedProbeFailure = true;
			console.warn(
				chalk.yellow(
					`  ffprobe failed on ${path.basename(output)}; treating as stale: ${String(error)}`,
				),
			);
		}
		return '';
	}
}
