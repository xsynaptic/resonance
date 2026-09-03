import chalk from 'chalk';
import fs from 'node:fs/promises';
import path from 'node:path';
import { $ } from 'zx';

import { isPathPresent } from '../shared/utils.js';

const databaseName = 'resonance-comments';

const backupDir = 'backups';

const filePattern = /^resonance-comments-(\d{4}-\d{2}-\d{2})\.sql\.gz$/;

// `backups/` is gitignored, so this lives on the operator's machine alone
const backupAfterDays = 30;

interface BackupOptions {
	isLocal?: boolean;
	rootPath: string;
}

export async function backupComments(options: BackupOptions): Promise<void> {
	const { isLocal = false, rootPath } = options;

	const scope = isLocal ? '--local' : '--remote';
	const date = new Date().toISOString().slice(0, 10);
	const directory = path.join(rootPath, backupDir);
	const filePath = path.join(directory, `${databaseName}-${date}.sql`);

	console.log(chalk.blue(`Exporting ${isLocal ? 'local' : 'remote'} D1 to ${filePath}.gz`));

	await fs.mkdir(directory, { recursive: true });
	await $({
		cwd: rootPath,
	})`pnpm exec wrangler d1 export ${databaseName} ${scope} --skip-confirmation --output ${filePath}`;
	await $`gzip -f ${filePath}`;

	const { size } = await fs.stat(`${filePath}.gz`);

	console.log(chalk.green(`Backup written (${String(Math.round(size / 1024))} KB)`));
}

// Called from `deploy-site`, where a backup old enough to matter is taken rather than announced
export async function backupIfStale(rootPath: string): Promise<void> {
	const latest = await findLatestBackup(path.join(rootPath, backupDir));

	if (latest) {
		const ageDays = Math.floor((Date.now() - Date.parse(latest)) / 86_400_000);

		if (ageDays < backupAfterDays) {
			console.log(chalk.gray(`  Last comment backup: ${latest}`));
			return;
		}
	}

	// Soft-fail: a deploy must not die on a backup
	try {
		await backupComments({ rootPath });
	} catch (error) {
		console.warn(chalk.yellow(`Comment backup skipped: ${String(error)}`));
	}
}

async function findLatestBackup(directory: string): Promise<string | undefined> {
	if (!(await isPathPresent(directory))) return undefined;

	const names = await fs.readdir(directory);

	const dates = names
		.map((name) => filePattern.exec(name)?.[1])
		.filter((date) => date !== undefined)
		.sort((left, right) => left.localeCompare(right));

	return dates.at(-1);
}
