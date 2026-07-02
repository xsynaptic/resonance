import chalk from 'chalk';
import path from 'node:path';

import { AUDIO_SOURCE_DIR, STREAMS_DIR } from '../audio/audio-paths.js';
import { fileExists } from '../shared/utils.js';
import { loadDeployConfig } from './deploy-config.js';
import { rsyncTo } from './rsync-exec.js';

const EXCLUDES = ['.DS_Store', '*.tmp', '.gitkeep'];

interface DeployAudioOptions {
	dryRun?: boolean;
	rootPath: string;
}

// Uploads originals to /artifacts/ and streaming renditions to /stream/. Uses mtime+size
// (not checksum) and never --delete: audio is append-only and multi-gigabyte, so a no-op
// run is near-instant and a local mistake can never wipe the remote archive.
export async function deployAudio(options: DeployAudioOptions): Promise<void> {
	const { dryRun = false, rootPath } = options;

	const config = loadDeployConfig();

	const sourceDir = path.join(rootPath, AUDIO_SOURCE_DIR);

	if (!(await fileExists(sourceDir))) {
		throw new Error(`Audio source directory not found: ${sourceDir}`);
	}

	const streamsDir = path.join(rootPath, STREAMS_DIR);

	console.log(chalk.blue('Deploying audio...'));
	if (dryRun) console.log(chalk.yellow('  DRY RUN'));

	const start = Date.now();

	console.log(
		chalk.gray(
			`  Originals: ${sourceDir}/ -> ${config.remoteHost}:${config.remoteAudioPath}/artifacts/`,
		),
	);
	await rsyncTo(`${sourceDir}/`, `${config.remoteHost}:${config.remoteAudioPath}/artifacts/`, {
		archive: 'av',
		config,
		dryRun,
		excludes: EXCLUDES,
		extraFlags: ['--partial'],
	});

	if (await fileExists(streamsDir)) {
		console.log(
			chalk.gray(
				`  Renditions: ${streamsDir}/ -> ${config.remoteHost}:${config.remoteAudioPath}/stream/`,
			),
		);
		await rsyncTo(`${streamsDir}/`, `${config.remoteHost}:${config.remoteAudioPath}/stream/`, {
			archive: 'av',
			config,
			dryRun,
			excludes: EXCLUDES,
			extraFlags: ['--partial'],
		});
	} else {
		console.log(
			chalk.yellow('  No renditions directory yet; skipping /stream/ (run audio-renditions first)'),
		);
	}

	console.log(chalk.green(`Done in ${((Date.now() - start) / 1000).toFixed(1)}s`));
}
