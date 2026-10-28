import { formatError, log, withStep } from '@xsynaptic/astro-scripts';
import { copyFile, mkdir, readdir, readFile, rm } from 'node:fs/promises';
import path from 'node:path';

import type { DeployConfig } from '#deploy/deploy-config.ts';
import type { StepStatus } from '#shared/step-status.ts';

import { remoteRoot } from '#deploy/deploy-audio.ts';
import { rsyncTo } from '#deploy/rsync-exec.ts';
import { ensureSshKeychain, isPathPresent } from '#shared/utils.ts';

// Matches STATE_DIR in deploy/stats/download-stats.py
const remoteStatsDir = `${remoteRoot}/stats`;
const localJsonDir = 'packages/content/data';
const localBackupDir = 'packages/content/downloads-backup';

const backupsKept = 14;

// Pulled together in one transfer; `downloads.json` is then copied on to where the build reads it
const statsFiles = ['downloads.json', 'run.log', 'stats.sqlite'];

interface StatsPullOptions {
	config: DeployConfig;
	dryRun?: boolean;
	rootPath: string;
}

// The JSON is derived; the SQLite rollup is the only irreplaceable copy, so it is backed up dated
// Never fatal: an unreachable host means building with the last-pulled copy
export async function pullStats(options: StatsPullOptions): Promise<StepStatus> {
	const { config, dryRun = false, rootPath } = options;

	const jsonDir = path.join(rootPath, localJsonDir);
	const backupDir = path.join(rootPath, localBackupDir);
	const backupDate = new Date().toISOString().slice(0, 10);

	return withStep('Pulling download stats', async (step) => {
		log.detail(`${config.remoteHost}:${remoteStatsDir}/ -> ${backupDir}/`);
		if (dryRun) log.warn('Dry run');

		try {
			await ensureSshKeychain();
			await mkdir(backupDir, { recursive: true });
			await mkdir(jsonDir, { recursive: true });

			// Landing on stable names gives the next pull a basis file to delta against
			await rsyncTo(
				statsFiles.map((file) => `${config.remoteHost}:${remoteStatsDir}/${file}`),
				`${backupDir}/`,
				{ archive: 'av', config, dryRun, quiet: true },
			);

			if (dryRun) return 'skipped';

			await copyFile(path.join(backupDir, 'downloads.json'), path.join(jsonDir, 'downloads.json'));
			await copyFile(
				path.join(backupDir, 'stats.sqlite'),
				path.join(backupDir, `stats-${backupDate}.sqlite`),
			);
			log.success(`Stats pulled (rollup DB backed up as stats-${backupDate}.sqlite)`);

			await pruneBackups(backupDir);
			// fallow-ignore-next-line code-duplication -- every soft-fail step ends in the same warn-and-return tail
			await reportFreshness(jsonDir, backupDir);

			return 'ok';
		} catch (error) {
			log.warn(
				`Stats pull failed; continuing with the last local downloads.json (if any): ${formatError(error)}`,
			);

			step.warn();
			return 'warned';
		}
	});
}

// Names are `stats-YYYY-MM-DD.sqlite`, so a lexical sort is a date sort
async function pruneBackups(backupDir: string): Promise<void> {
	const entries = await readdir(backupDir);
	const snapshots = entries
		.filter((entry) => /^stats-\d{4}-\d{2}-\d{2}\.sqlite$/.test(entry))
		.toSorted((first, second) => first.localeCompare(second));
	const stale = snapshots.slice(0, Math.max(0, snapshots.length - backupsKept));

	if (stale.length === 0) return;

	for (const snapshot of stale) {
		await rm(path.join(backupDir, snapshot));
	}
	log.detail(`Pruned ${String(stale.length)} snapshots, keeping the newest ${String(backupsKept)}`);
}

async function reportFreshness(jsonDir: string, backupDir: string): Promise<void> {
	const jsonPath = path.join(jsonDir, 'downloads.json');
	const runLogPath = path.join(backupDir, 'run.log');

	if (await isPathPresent(jsonPath)) {
		const document = JSON.parse(await readFile(jsonPath, 'utf8')) as { generated_at?: string };

		log.detail(`Generated ${document.generated_at ?? 'unknown'}`);
	}

	if (!(await isPathPresent(runLogPath))) return;

	const runLog = await readFile(runLogPath, 'utf8');
	const lines = runLog.trimEnd().split('\n');
	const lastRun = lines.at(-1)?.slice(0, 20) ?? '';
	const latest = lines.filter((line) => line.startsWith(lastRun));

	for (const line of latest) {
		if (line.includes('WARNING')) {
			log.warn(line);
			continue;
		}

		log.detail(line);
	}
}
