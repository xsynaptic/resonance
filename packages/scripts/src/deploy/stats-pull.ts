import chalk from 'chalk';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

import { loadDeployConfig } from './deploy-config.js';
import { rsyncFrom } from './rsync-exec.js';

// Matches STATE_DIR in deploy/stats/download-stats.py
const remoteStatsDir = '/srv/resonance/stats';
const localJsonDir = 'packages/content';
const localBackupDir = 'packages/content/downloads-backup';

interface StatsPullOptions {
	dryRun?: boolean;
	rootPath: string;
}

// The JSON is derived; the SQLite rollup is the only irreplaceable copy, so it is backed up dated
// Never fatal: an unreachable host means building with the last-pulled copy
export async function pullStats(options: StatsPullOptions): Promise<void> {
	const { dryRun = false, rootPath } = options;

	const config = loadDeployConfig();

	const jsonDir = path.join(rootPath, localJsonDir);
	const backupDir = path.join(rootPath, localBackupDir);
	const backupDate = new Date().toISOString().slice(0, 10);

	console.log(chalk.blue('Pulling download stats...'));
	console.log(chalk.gray(`  ${config.remoteHost}:${remoteStatsDir}/downloads.json -> ${jsonDir}/`));
	if (dryRun) console.log(chalk.yellow('  DRY RUN'));

	try {
		await mkdir(backupDir, { recursive: true });
		await rsyncFrom(`${config.remoteHost}:${remoteStatsDir}/downloads.json`, `${jsonDir}/`, {
			archive: 'av',
			config,
			dryRun,
		});
		await rsyncFrom(
			`${config.remoteHost}:${remoteStatsDir}/stats.sqlite`,
			`${backupDir}/stats-${backupDate}.sqlite`,
			{
				archive: 'av',
				config,
				dryRun,
			},
		);
		console.log(chalk.green(`Stats pulled (rollup DB backed up as stats-${backupDate}.sqlite)`));
	} catch (error) {
		console.log(
			chalk.yellow(
				`Stats pull failed; continuing with the last local downloads.json (if any): ${String(error)}`,
			),
		);
	}
}
