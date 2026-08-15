import chalk from 'chalk';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

import { loadDeployConfig } from './deploy-config.js';
import { rsyncFrom } from './rsync-exec.js';

// Matches STATE_DIR in deploy/stats/download-stats.py
const REMOTE_STATS_DIR = '<stats-state-path>';
const LOCAL_JSON_DIR = 'packages/content';
const LOCAL_BACKUP_DIR = 'packages/content/downloads-backup';

interface StatsPullOptions {
	dryRun?: boolean;
	rootPath: string;
}

// Pull downloads.json for the build, plus the SQLite rollup as an offsite backup
// The JSON is derived; the database is the only irreplaceable artifact on the box
// Backups are dated so a corrupted remote DB can never clobber the last good copy
// Never fatal: an unreachable box means building with the last-pulled copy
export async function pullStats(options: StatsPullOptions): Promise<void> {
	const { dryRun = false, rootPath } = options;

	const config = loadDeployConfig();

	const jsonDir = path.join(rootPath, LOCAL_JSON_DIR);
	const backupDir = path.join(rootPath, LOCAL_BACKUP_DIR);
	const backupDate = new Date().toISOString().slice(0, 10);

	console.log(chalk.blue('Pulling download stats...'));
	console.log(
		chalk.gray(`  ${config.remoteHost}:${REMOTE_STATS_DIR}/downloads.json -> ${jsonDir}/`),
	);
	if (dryRun) console.log(chalk.yellow('  DRY RUN'));

	try {
		await mkdir(backupDir, { recursive: true });
		await rsyncFrom(`${config.remoteHost}:${REMOTE_STATS_DIR}/downloads.json`, `${jsonDir}/`, {
			archive: 'av',
			config,
			dryRun,
		});
		await rsyncFrom(
			`${config.remoteHost}:${REMOTE_STATS_DIR}/stats.sqlite`,
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
