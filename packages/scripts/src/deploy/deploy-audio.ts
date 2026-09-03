import chalk from 'chalk';
import path from 'node:path';

import { audioSourceDir, streamsDir } from '../audio/audio-paths.js';
import { isPathPresent } from '../shared/utils.js';
import { loadDeployConfig } from './deploy-config.js';
import { rsyncTo } from './rsync-exec.js';

const rsyncExcludes = ['.DS_Store', '*.tmp', '.gitkeep'];

// The remote host serves other traffic; nice this side so rsync never wins the CPU
// ionice is inert under mq-deadline but stays correct if the scheduler ever changes
const rsyncRemotePath = ['--rsync-path=ionice -c3 nice -n19 rsync'];

interface DeployAudioOptions {
	dryRun?: boolean;
	rootPath: string;
}

// mtime+size, not checksum: audio is append-only and multi-gigabyte, so a no-op run is near-instant
// Never --delete, so a local mistake can't wipe the remote archive
export async function deployAudio(options: DeployAudioOptions): Promise<void> {
	const { dryRun = false, rootPath } = options;

	const config = loadDeployConfig();

	const sourceDir = path.join(rootPath, audioSourceDir);

	if (!(await isPathPresent(sourceDir))) {
		throw new Error(`Audio source directory not found: ${sourceDir}`);
	}

	const streamsPath = path.join(rootPath, streamsDir);

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
		excludes: rsyncExcludes,
		extraFlags: ['--partial', ...rsyncRemotePath],
	});

	if (await isPathPresent(streamsPath)) {
		console.log(
			chalk.gray(
				`  Renditions: ${streamsPath}/ -> ${config.remoteHost}:${config.remoteAudioPath}/stream/`,
			),
		);
		await rsyncTo(`${streamsPath}/`, `${config.remoteHost}:${config.remoteAudioPath}/stream/`, {
			archive: 'av',
			config,
			dryRun,
			excludes: rsyncExcludes,
			extraFlags: ['--partial', ...rsyncRemotePath],
		});
	} else {
		console.log(
			chalk.yellow('  No renditions directory yet; skipping /stream/ (run audio-renditions first)'),
		);
	}

	console.log(chalk.green(`Done in ${((Date.now() - start) / 1000).toFixed(1)}s`));
}
