import chalk from 'chalk';
import fs from 'node:fs/promises';
import path from 'node:path';
import pLimit from 'p-limit';
import { $ } from 'zx';

import { AUDIO_SOURCE_DIR, STREAMS_DIR } from './audio-paths.js';

const CONCURRENCY = 3;
const RENDITION_EXTENSION = '.m4a';
const TMP_EXTENSION = '.m4a.tmp';

interface RenditionJob {
	output: string;
	source: string;
}

interface RenditionsOptions {
	dryRun?: boolean;
	rootPath: string;
}

// Derives 192kbps AAC .m4a streaming renditions from each source (flac preferred, mp3 fallback).
// Incremental: skips outputs newer than their source. Atomic: encodes to a tmp file then renames.
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

// Interrupted encodes leave `.m4a.tmp` files behind; clear them so none masquerade as complete
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

	// -vn drops cover art (a video track breaks faststart); -map_metadata 0 keeps tags;
	// +faststart moves the moov atom first for progressive playback and seeking;
	// -f mp4 is explicit because the .tmp suffix hides the container format
	await $`ffmpeg -nostdin -hide_banner -loglevel error -y -i ${job.source} -vn -map_metadata 0 -c:a aac -b:a 192k -movflags +faststart -f mp4 ${tmp}`;

	await fs.rename(tmp, job.output);
}

async function isUpToDate(source: string, output: string): Promise<boolean> {
	try {
		const [sourceStat, outputStat] = await Promise.all([fs.stat(source), fs.stat(output)]);
		return outputStat.mtimeMs >= sourceStat.mtimeMs;
	} catch {
		return false;
	}
}
