import type { Step } from '@xsynaptic/astro-scripts';

import {
	formatBytes,
	formatError,
	readChild,
	withSpinner,
	withStep,
} from '@xsynaptic/astro-scripts';
import fs from 'node:fs/promises';
import path from 'node:path';

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

	await withSpinner(
		`Exporting ${isLocal ? 'local' : 'remote'} ${databaseName} to ${filePath}.gz`,
		async () => {
			await fs.mkdir(directory, { recursive: true });
			await readChild(
				[
					'pnpm',
					'exec',
					'wrangler',
					'd1',
					'export',
					databaseName,
					scope,
					'--skip-confirmation',
					'--output',
					filePath,
				],
				{ cwd: rootPath },
			);
			await readChild(['gzip', '-f', filePath]);

			return fs.stat(`${filePath}.gz`);
		},
		({ size }) => `Backed up ${databaseName} (${formatBytes(size)})`,
	);
}

// Called from `deploy-site`, where a backup old enough to matter is taken rather than announced
export async function backupIfStale(options: BackupIfStaleOptions): Promise<void> {
	await withStep('Backing up D1', async (step) => {
		for (const databaseName of databaseNames) await backupOne(databaseName, step, options);
	});
}

async function backupOne(
	databaseName: string,
	step: Step,
	options: BackupIfStaleOptions,
): Promise<void> {
	const { dryRun = false, rootPath } = options;

	const latest = await findLatestBackup(
		path.join(rootPath, backupDir),
		toFilePattern(databaseName),
	);

	if (latest) {
		const ageDays = Math.floor((Date.now() - Date.parse(latest)) / 86_400_000);

		if (ageDays < backupAfterDays) {
			step.skip(`${databaseName}: last backup ${latest}`);
			return;
		}
	}

	if (dryRun) {
		step.skip(`${databaseName}: stale, not taken in a dry run`);
		return;
	}

	// Soft-fail: a deploy must not die on a backup
	try {
		await backupDatabase({ databaseName, rootPath });
	} catch (error) {
		step.warn(`${databaseName}: ${formatError(error)}`);
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
		.toSorted((left, right) => left.localeCompare(right));

	return dates.at(-1);
}

function toFilePattern(databaseName: string): RegExp {
	return new RegExp(String.raw`^${databaseName}-(\d{4}-\d{2}-\d{2})\.sql\.gz$`);
}
