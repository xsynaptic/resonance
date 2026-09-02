import chalk from 'chalk';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import pLimit from 'p-limit';
import { $ } from 'zx';

import { audioSourceDir, streamsDir } from './audio-paths.js';
import { collectAudioSources } from './audio-sources.js';

const concurrency = 3;
const renditionExtension = '.webm';
const tmpExtension = '.webm.tmp';

const encoderArgs = [
	'-vn', // Drops cover art; webm would otherwise re-encode the 6MB embedded image as a VP9 video track
	'-map_metadata', // Keeps tags, minus WAVEFORM, reducing time to first byte
	'0',
	'-metadata',
	'WAVEFORM=',
	'-c:a',
	'libopus',
	'-b:a',
	'160k',
	'-cues_to_front', // Puts the seek index before the clusters so a seek needs no round trip to the tail
	'1',
];

// Stamped into every rendition and checked on the next run
// mtime can't see a settings change; without this an encoderArgs edit leaves old encodes in place
const renditionProfile = crypto
	.createHash('sha256')
	.update(encoderArgs.join(' '))
	.digest('hex')
	.slice(0, 12);

interface RenditionJob {
	output: string;
	source: string;
}

interface RenditionsOptions {
	dryRun?: boolean;
	rootPath: string;
}

// 160kbps Opus .webm streaming renditions per source (FLAC preferred, MP3 fallback)
// Incremental: skips outputs newer than their source and stamped with the current encoder profile
// Atomic: encodes to a tmp file then renames
export async function generateRenditions(options: RenditionsOptions): Promise<void> {
	const { dryRun = false, rootPath } = options;

	try {
		await $`which ffmpeg`.quiet();
	} catch {
		throw new Error('ffmpeg not found on PATH. Install it with: brew install ffmpeg');
	}

	const streamsPath = path.join(rootPath, streamsDir);
	const sources = await collectAudioSources(path.join(rootPath, audioSourceDir));

	const jobs = sources.map((source): RenditionJob => ({
		output: path.join(streamsPath, `${source.base}${renditionExtension}`),
		source: source.path,
	}));

	await fs.mkdir(streamsPath, { recursive: true });
	await cleanStaleTmp(streamsPath);

	const upToDate = await Promise.all(jobs.map((job) => isUpToDate(job.source, job.output)));
	const pending = jobs.filter((_, index) => upToDate[index] !== true);
	const skipped = jobs.length - pending.length;

	console.log(
		chalk.blue(
			`Renditions: ${String(jobs.length)} total, ${String(skipped)} up to date, ${String(pending.length)} to encode`,
		),
	);

	if (dryRun) {
		for (const job of pending) {
			console.log(
				chalk.yellow(
					`  DRY RUN encode: ${path.basename(job.source)} -> ${path.basename(job.output)}`,
				),
			);
		}
		return;
	}

	const limit = pLimit(concurrency);
	let done = 0;

	const results = await Promise.allSettled(
		pending.map((job) =>
			limit(async () => {
				await encode(job);
				done += 1;
				console.log(
					chalk.green(`  [${String(done)}/${String(pending.length)}] ${path.basename(job.output)}`),
				);
			}),
		),
	);

	const failures = results.filter(
		(result): result is PromiseRejectedResult => result.status === 'rejected',
	);

	if (failures.length > 0) {
		for (const failure of failures)
			console.error(chalk.red(`  encode failed: ${String(failure.reason)}`));
		throw new Error(`${String(failures.length)} rendition(s) failed to encode`);
	}

	console.log(
		chalk.green(
			`Renditions complete: ${String(pending.length)} encoded, ${String(skipped)} unchanged`,
		),
	);
}

// Interrupted encodes leave `.webm.tmp` files behind; clear them so none masquerade as complete
async function cleanStaleTmp(dir: string): Promise<void> {
	let existing: Array<string>;

	try {
		existing = await fs.readdir(dir);
	} catch {
		return;
	}

	await Promise.all(
		existing
			.filter((name) => name.endsWith(tmpExtension))
			.map((name) => fs.rm(path.join(dir, name), { force: true })),
	);
}

async function encode(job: RenditionJob): Promise<void> {
	const tmp = `${job.output}.tmp`;

	// -f webm is explicit because the .tmp suffix hides the container format
	await $`ffmpeg -nostdin -hide_banner -loglevel error -y -i ${job.source} ${encoderArgs} -metadata ${`RENDITION_PROFILE=${renditionProfile}`} -f webm ${tmp}`;

	await fs.rename(tmp, job.output);
}

async function isUpToDate(source: string, output: string): Promise<boolean> {
	try {
		const [sourceStat, outputStat] = await Promise.all([fs.stat(source), fs.stat(output)]);
		if (outputStat.mtimeMs < sourceStat.mtimeMs) return false;
	} catch {
		return false;
	}

	return (await readProfile(output)) === renditionProfile;
}

// Reads only the header, which -cues_to_front keeps at the front of the file
async function readProfile(output: string): Promise<string> {
	try {
		const result =
			await $`ffprobe -v error -show_entries format_tags=RENDITION_PROFILE -of default=nw=1:nk=1 ${output}`.quiet();
		return result.stdout.trim();
	} catch {
		return '';
	}
}
