import chalk from 'chalk';
import { mkdir, readdir, readFile, rm } from 'node:fs/promises';
import path from 'node:path';

import type { DeployConfig } from './deploy-config.js';

import { ensureSshKeychain, isPathPresent } from '../shared/utils.js';
import { remoteRoot } from './deploy-audio.js';
import { rsync } from './rsync-exec.js';

// Matches STATE_DIR in deploy/stats/download-stats.py
const remoteStatsDir = `${remoteRoot}/stats`;
const localJsonDir = 'packages/content';
const localBackupDir = 'packages/content/downloads-backup';

const backupsKept = 14;

interface StatsPullOptions {
	config: DeployConfig;
	dryRun?: boolean;
	rootPath: string;
}

// The JSON is derived; the SQLite rollup is the only irreplaceable copy, so it is backed up dated
// Never fatal: an unreachable host means building with the last-pulled copy
export async function pullStats(options: StatsPullOptions): Promise<void> {
	const { config, dryRun = false, rootPath } = options;

	const jsonDir = path.join(rootPath, localJsonDir);
	const backupDir = path.join(rootPath, localBackupDir);
	const backupDate = new Date().toISOString().slice(0, 10);

	console.log(chalk.blue('Pulling download stats...'));
	console.log(chalk.gray(`  ${config.remoteHost}:${remoteStatsDir}/downloads.json -> ${jsonDir}/`));
	if (dryRun) console.log(chalk.yellow('  DRY RUN'));

	try {
		await ensureSshKeychain();
		await mkdir(backupDir, { recursive: true });
		await rsync(`${config.remoteHost}:${remoteStatsDir}/downloads.json`, `${jsonDir}/`, { dryRun });
		await rsync(
			`${config.remoteHost}:${remoteStatsDir}/stats.sqlite`,
			`${backupDir}/stats-${backupDate}.sqlite`,
			{ dryRun },
		);
		await rsync(`${config.remoteHost}:${remoteStatsDir}/run.log`, `${backupDir}/run.log`, {
			dryRun,
		});
		console.log(chalk.green(`Stats pulled (rollup DB backed up as stats-${backupDate}.sqlite)`));

		if (dryRun) return;

		await pruneBackups(backupDir);
		await reportFreshness(jsonDir, backupDir);
	} catch (error) {
		console.log(
			chalk.yellow(
				`Stats pull failed; continuing with the last local downloads.json (if any): ${String(error)}`,
			),
		);
	}
}

// Names are `stats-YYYY-MM-DD.sqlite`, so a lexical sort is a date sort
async function pruneBackups(backupDir: string): Promise<void> {
	const entries = await readdir(backupDir);
	const snapshots = entries
		.filter((entry) => /^stats-\d{4}-\d{2}-\d{2}\.sqlite$/.test(entry))
		.sort((first, second) => first.localeCompare(second));
	const stale = snapshots.slice(0, Math.max(0, snapshots.length - backupsKept));

	if (stale.length === 0) return;

	for (const snapshot of stale) {
		await rm(path.join(backupDir, snapshot));
	}
	console.log(
		chalk.gray(
			`  Pruned ${String(stale.length)} snapshots, keeping the newest ${String(backupsKept)}`,
		),
	);
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
