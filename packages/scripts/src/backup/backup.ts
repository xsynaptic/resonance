import chalk from 'chalk';
import fs from 'node:fs/promises';
import path from 'node:path';
import { $ } from 'zx';

import type { StepStatus } from '#shared/step-status.ts';

import { isPathPresent } from '#shared/utils.ts';

// Each database runs its own 30-day clock, so a new one does not reset the other's
export const databaseNames = ['resonance-comments', 'resonance-stats'];

const backupDir = 'backups';

// `backups/` is gitignored, so this lives on the operator's machine alone
const backupAfterDays = 30;

interface BackupIfStaleOptions {
	dryRun?: boolean;
	rootPath: string;
}

interface BackupOptions {
	databaseName: string;
	isLocal?: boolean;
	rootPath: string;
}

export async function backupDatabase(options: BackupOptions): Promise<void> {
	const { databaseName, isLocal = false, rootPath } = options;

	const scope = isLocal ? '--local' : '--remote';
	const date = new Date().toISOString().slice(0, 10);
	const directory = path.join(rootPath, backupDir);
	const filePath = path.join(directory, `${databaseName}-${date}.sql`);

	console.log(
		chalk.blue(`Exporting ${isLocal ? 'local' : 'remote'} ${databaseName} to ${filePath}.gz`),
	);

	await fs.mkdir(directory, { recursive: true });
	await $({
		cwd: rootPath,
	})`pnpm exec wrangler d1 export ${databaseName} ${scope} --skip-confirmation --output ${filePath}`;
	await $`gzip -f ${filePath}`;

	const { size } = await fs.stat(`${filePath}.gz`);

	console.log(chalk.green(`Backup written (${String(Math.round(size / 1024))} KB)`));
}

// Called from `deploy-site`, where a backup old enough to matter is taken rather than announced
export async function backupIfStale(options: BackupIfStaleOptions): Promise<StepStatus> {
	const statuses: Array<StepStatus> = [];

	for (const databaseName of databaseNames) {
		statuses.push(await backupOne(databaseName, options));
	}

	if (statuses.includes('warned')) return 'warned';
	if (statuses.includes('ok')) return 'ok';

	return 'skipped';
}

async function backupOne(databaseName: string, options: BackupIfStaleOptions): Promise<StepStatus> {
	const { dryRun = false, rootPath } = options;

	const latest = await findLatestBackup(
		path.join(rootPath, backupDir),
		toFilePattern(databaseName),
	);

	if (latest) {
		const ageDays = Math.floor((Date.now() - Date.parse(latest)) / 86_400_000);

		if (ageDays < backupAfterDays) {
			console.log(chalk.gray(`  Last ${databaseName} backup: ${latest}`));

			return 'skipped';
		}
	}

	if (dryRun) {
		console.log(chalk.yellow(`  DRY RUN: ${databaseName} backup is stale but not taken`));

		return 'skipped';
	}

	// Soft-fail: a deploy must not die on a backup
	try {
		await backupDatabase({ databaseName, rootPath });

		return 'ok';
	} catch (error) {
		console.warn(chalk.yellow(`${databaseName} backup skipped: ${String(error)}`));

		return 'warned';
	}
}

async function findLatestBackup(
	directory: string,
	filePattern: RegExp,
): Promise<string | undefined> {
	if (!(await isPathPresent(directory))) return undefined;

	const names = await fs.readdir(directory);

	const dates = names
		.map((name) => filePattern.exec(name)?.[1])
		.filter((date) => date !== undefined)
		.sort((left, right) => left.localeCompare(right));

	return dates.at(-1);
}

function toFilePattern(databaseName: string): RegExp {
	return new RegExp(String.raw`^${databaseName}-(\d{4}-\d{2}-\d{2})\.sql\.gz$`);
}
