import chalk from 'chalk';
import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';

import { isPathPresent } from '../shared/utils.js';
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
		await rsyncFrom(`${config.remoteHost}:${remoteStatsDir}/run.log`, `${backupDir}/run.log`, {
			archive: 'av',
			config,
			dryRun,
		});
		console.log(chalk.green(`Stats pulled (rollup DB backed up as stats-${backupDate}.sqlite)`));

		if (!dryRun) await reportFreshness(jsonDir, backupDir);
	} catch (error) {
		console.log(
			chalk.yellow(
				`Stats pull failed; continuing with the last local downloads.json (if any): ${String(error)}`,
			),
		);
	}
}

async function reportFreshness(jsonDir: string, backupDir: string): Promise<void> {
	const jsonPath = path.join(jsonDir, 'downloads.json');
	const runLogPath = path.join(backupDir, 'run.log');

	if (await isPathPresent(jsonPath)) {
		const document = JSON.parse(await readFile(jsonPath, 'utf8')) as { generated_at?: string };

		console.log(chalk.gray(`  Generated ${document.generated_at ?? 'unknown'}`));
	}

	if (!(await isPathPresent(runLogPath))) return;

	const runLog = await readFile(runLogPath, 'utf8');
	const lines = runLog.trimEnd().split('\n');
	const lastRun = lines.at(-1)?.slice(0, 20) ?? '';
	const latest = lines.filter((line) => line.startsWith(lastRun));

	for (const line of latest) {
		console.log(line.includes('WARNING') ? chalk.yellow(`  ${line}`) : chalk.gray(`  ${line}`));
	}
}
