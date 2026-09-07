import chalk from 'chalk';
import path from 'node:path';

import type { DeployConfig } from '#deploy/deploy-config.ts';

import { audioSourceDir, streamsDir } from '#audio/audio-paths.ts';
import { rsync } from '#deploy/rsync-exec.ts';
import { ensureSshKeychain, isPathPresent } from '#shared/utils.ts';

// The one place the server layout is named; stats-pull derives its own path from this
export const remoteRoot = '/srv/resonance';

const rsyncExcludes = ['.DS_Store', '*.tmp', '.gitkeep'];

const rsyncFlags = [
	// `--partial-dir` basis fails verification from rsync 3.5.0 to the box's 3.2.7
	'--partial',
	// -a would carry a 0600 source through to the box, where the `the-web-server` worker could not read it
	'--chmod=D755,F644',
	// A sleeping laptop should fail the run and resume from the partial file, not hang on TCP
	'--timeout=60',
	'-e',
	'ssh -o ConnectTimeout=15',
	// The remote host serves other traffic; nice this side so rsync never wins the CPU
	'--rsync-path=nice -n19 rsync',
	// One line per transferred file, which the health check probes
	'--out-format=%n',
];

const transferredOriginal = /\.(?:flac|mp3)$/i;
const transferredRendition = /\.webm$/i;

export interface DeployedAudio {
	originals: Array<string>;
	renditions: Array<string>;
}

interface DeployAudioOptions {
	config: DeployConfig;
	dryRun?: boolean;
	rootPath: string;
}

// mtime+size, not checksum: audio is append-only and multi-gigabyte, so a no-op run is near-instant
// The originals leg never deletes, so a local mistake can't wipe the archive
// Neither does the stream leg; reapRenditions clears superseded hashes once the new pages are live
export async function deployAudio(options: DeployAudioOptions): Promise<DeployedAudio> {
	const { config, dryRun = false, rootPath } = options;

	const sourceDir = path.join(rootPath, audioSourceDir);

	if (!(await isPathPresent(sourceDir))) {
		throw new Error(`Audio source directory not found: ${sourceDir}`);
	}

	await ensureSshKeychain();

	const streamsPath = path.join(rootPath, streamsDir);

	console.log(chalk.blue('Deploying audio...'));
	if (dryRun) console.log(chalk.yellow('  DRY RUN'));

	const start = Date.now();

	console.log(
		chalk.gray(`  Originals: ${sourceDir}/ -> ${config.remoteHost}:${remoteRoot}/artifacts/`),
	);
	const artifactsOutput = await rsync(
		`${sourceDir}/`,
		`${config.remoteHost}:${remoteRoot}/artifacts/`,
		{ dryRun, excludes: rsyncExcludes, extraFlags: rsyncFlags },
	);

	let streamOutput = '';

	if (await isPathPresent(streamsPath)) {
		console.log(
			chalk.gray(`  Renditions: ${streamsPath}/ -> ${config.remoteHost}:${remoteRoot}/stream/`),
		);
		streamOutput = await rsync(`${streamsPath}/`, `${config.remoteHost}:${remoteRoot}/stream/`, {
			dryRun,
			excludes: rsyncExcludes,
			extraFlags: rsyncFlags,
		});
	} else {
		console.log(
			chalk.yellow('  No renditions directory yet; skipping /stream/ (run audio-renditions first)'),
		);
	}

	const originals = parseTransferred(artifactsOutput, transferredOriginal);
	const renditions = parseTransferred(streamOutput, transferredRendition);

	console.log(
		chalk.green(
			`Done in ${((Date.now() - start) / 1000).toFixed(1)}s (${String(originals.length)} original(s), ${String(renditions.length)} rendition(s) transferred)`,
		),
	);

	return { originals, renditions };
}

// A rendition is named for its own bytes, so a re-encode lands beside the generation the live site
// still references; deleting before the new pages ship would 404 every stream for the whole upload
// Nothing transfers here: the upload pass already matched mtime and size, so only orphans go
export async function reapRenditions(options: DeployAudioOptions): Promise<void> {
	const { config, dryRun = false, rootPath } = options;

	const streamsPath = path.join(rootPath, streamsDir);

	if (!(await isPathPresent(streamsPath))) return;

	console.log(chalk.blue('Reaping superseded renditions...'));
	if (dryRun) console.log(chalk.yellow('  DRY RUN'));

	const output = await rsync(`${streamsPath}/`, `${config.remoteHost}:${remoteRoot}/stream/`, {
		dryRun,
		excludes: rsyncExcludes,
		extraFlags: [...rsyncFlags, '--delete'],
	});

	console.log(
		chalk.green(
			`Reaped ${String(countDeleted(output, transferredRendition))} superseded rendition(s)`,
		),
	);
}

function countDeleted(output: string, pattern: RegExp): number {
	return output
		.split('\n')
		.map((line) => line.trim())
		.filter((line) => line.startsWith('deleting ') && pattern.test(line)).length;
}

// --progress writes its own lines into the same stream, so match on the extension rather than shape
// `--delete` writes `deleting <name>`, which also ends in the extension and is not a transfer
function parseTransferred(output: string, pattern: RegExp): Array<string> {
	return output
		.split('\n')
		.map((line) => line.trim())
		.filter((line) => !line.startsWith('deleting ') && pattern.test(line));
}
