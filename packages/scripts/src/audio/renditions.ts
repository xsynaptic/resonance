import chalk from 'chalk';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import pLimit from 'p-limit';
import { $ } from 'zx';

import { AUDIO_SOURCE_DIR, STREAMS_DIR } from './audio-paths.js';

const CONCURRENCY = 3;
const RENDITION_EXTENSION = '.webm';
const TMP_EXTENSION = '.webm.tmp';

const ENCODER_ARGS = [
	'-vn', // -vn drops cover art; webm would otherwise re-encode the 6MB embedded image as a VP9 video track
	'-map_metadata', // -map_metadata 0 keeps tags, minus WAVEFORM, reducing time to first byte
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
// mtime alone cannot see a settings change, so without this an edit to ENCODER_ARGS would silently leave old encodes in place
const RENDITION_PROFILE = crypto
	.createHash('sha256')
	.update(ENCODER_ARGS.join(' '))
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

// 160kbps Opus .webm streaming renditions per source (FLAC preferred, MP# fallback)
// Incremental: skips outputs newer than their source and stamped with the current encoder profile
// Atomic: encodes to a tmp file then renames
export async function generateRenditions(options: RenditionsOptions): Promise<void> {
	const { dryRun = false, rootPath } = options;

	try {
		await $`which ffmpeg`.quiet();
	} catch {
		throw new Error('ffmpeg not found on PATH. Install it with: brew install ffmpeg');
	}

	const sourceDir = path.join(rootPath, AUDIO_SOURCE_DIR);
	const streamsDir = path.join(rootPath, STREAMS_DIR);

	let entries: Array<string>;

	try {
		entries = await fs.readdir(sourceDir);
	} catch {
		throw new Error(`Audio source directory not found: ${sourceDir}`);
	}

	const sources = new Map<string, { flac?: string; mp3?: string }>();

	for (const entry of entries) {
		const ext = path.extname(entry).toLowerCase();
		if (ext !== '.mp3' && ext !== '.flac') continue;

		const base = entry.slice(0, -ext.length);
		const record = sources.get(base) ?? {};

		if (ext === '.flac') record.flac = entry;
		else record.mp3 = entry;

		sources.set(base, record);
	}

	const jobs: Array<RenditionJob> = [];

	for (const [base, record] of sources) {
		const sourceName = record.flac ?? record.mp3;
		if (sourceName === undefined) continue;

		jobs.push({
			output: path.join(streamsDir, `${base}${RENDITION_EXTENSION}`),
			source: path.join(sourceDir, sourceName),
		});
	}

	await fs.mkdir(streamsDir, { recursive: true });
	await cleanStaleTmp(streamsDir);

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

	const limit = pLimit(CONCURRENCY);
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
			.filter((name) => name.endsWith(TMP_EXTENSION))
			.map((name) => fs.rm(path.join(dir, name), { force: true })),
	);
}

async function encode(job: RenditionJob): Promise<void> {
	const tmp = `${job.output}.tmp`;

	// -f webm is explicit because the .tmp suffix hides the container format
	await $`ffmpeg -nostdin -hide_banner -loglevel error -y -i ${job.source} ${ENCODER_ARGS} -metadata ${`RENDITION_PROFILE=${RENDITION_PROFILE}`} -f webm ${tmp}`;

	await fs.rename(tmp, job.output);
}

async function isUpToDate(source: string, output: string): Promise<boolean> {
	try {
		const [sourceStat, outputStat] = await Promise.all([fs.stat(source), fs.stat(output)]);
		if (outputStat.mtimeMs < sourceStat.mtimeMs) return false;
	} catch {
		return false;
	}

	return (await readProfile(output)) === RENDITION_PROFILE;
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
