import chalk from 'chalk';
import path from 'node:path';

import type { DeployConfig } from './deploy-config.js';

import { audioSourceDir, streamsDir } from '../audio/audio-paths.js';
import { ensureSshKeychain, isPathPresent } from '../shared/utils.js';
import { rsync } from './rsync-exec.js';

// The one place the server layout is named; stats-pull derives its own path from this
export const remoteRoot = '/srv/resonance';

const rsyncExcludes = ['.DS_Store', '*.tmp', '.gitkeep'];

const rsyncFlags = [
	`--partial-dir=${remoteRoot}/.rsync-partial`,
	// -a would carry a 0600 source through to the box, where the `the-web-server` worker could not read it
	'--chmod=D755,F644',
	// A sleeping laptop should fail the run and resume from the partial dir, not hang on TCP
	'--timeout=60',
	'-e',
	'ssh -o ConnectTimeout=15',
	// The remote host serves other traffic; nice this side so rsync never wins the CPU
	'--rsync-path=nice -n19 rsync',
	// One line per transferred file, which the health check probes
	'--out-format=%n',
];

const transferredOriginal = /\.(?:flac|mp3)$/i;

interface DeployAudioOptions {
	config: DeployConfig;
	dryRun?: boolean;
	rootPath: string;
}

// mtime+size, not checksum: audio is append-only and multi-gigabyte, so a no-op run is near-instant
// Never --delete, so a local mistake can't wipe the remote archive
// Returns the filenames this run put under /artifacts/
export async function deployAudio(options: DeployAudioOptions): Promise<Array<string>> {
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

	if (await isPathPresent(streamsPath)) {
		console.log(
			chalk.gray(`  Renditions: ${streamsPath}/ -> ${config.remoteHost}:${remoteRoot}/stream/`),
		);
		await rsync(`${streamsPath}/`, `${config.remoteHost}:${remoteRoot}/stream/`, {
			dryRun,
			excludes: rsyncExcludes,
			extraFlags: rsyncFlags,
		});
	} else {
		console.log(
			chalk.yellow('  No renditions directory yet; skipping /stream/ (run audio-renditions first)'),
		);
	}

	const uploaded = parseTransferred(artifactsOutput);

	console.log(
		chalk.green(
			`Done in ${((Date.now() - start) / 1000).toFixed(1)}s (${String(uploaded.length)} original(s) transferred)`,
		),
	);

	return uploaded;
}

// --progress writes its own lines into the same stream, so match on the extension rather than shape
function parseTransferred(output: string): Array<string> {
	return output
		.split('\n')
		.map((line) => line.trim())
		.filter((line) => transferredOriginal.test(line));
}
