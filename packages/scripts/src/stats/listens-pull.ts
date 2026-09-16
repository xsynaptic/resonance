import type { ListensRow, ListensSnapshot } from '@xsynaptic/shared/stats';

import { listensSnapshotSchema, queryStats } from '@xsynaptic/shared/stats';
import chalk from 'chalk';
import { mkdir, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

import type { StepStatus } from '#shared/step-status.ts';

export interface PullListensOptions {
	dryRun?: boolean;
	rootPath: string;
}

const snapshotPath = 'packages/content/data/listens.json';

const listensQuery = `
	SELECT mix_id, day, COUNT(*) AS listens, SUM(heard_seconds) AS seconds
	FROM listens
	GROUP BY mix_id, day
	ORDER BY mix_id, day
`;

// Soft-fail by design, as the other stats pulls are: fresh counts are nice, a deploy blocked on them is not
export async function pullListens(options: PullListensOptions): Promise<StepStatus> {
	const { dryRun = false, rootPath } = options;

	if (dryRun) {
		console.log(chalk.yellow('  DRY RUN: listening stats not pulled'));

		return 'skipped';
	}

	console.log(chalk.blue('Pulling listening stats...'));

	try {
		const rows = await queryStats<ListensRow>(listensQuery, { cwd: rootPath });

		// Validated before writing, so a change to the table's columns fails the pull rather than the build
		const snapshot = listensSnapshotSchema.parse({
			pulledAt: new Date().toISOString(),
			rows,
		}) satisfies ListensSnapshot;

		await writeSnapshot(path.join(rootPath, snapshotPath), snapshot);

		console.log(chalk.green(`  ${String(snapshot.rows.length)} rows written to ${snapshotPath}`));

		return 'ok';
	} catch (error) {
		console.warn(chalk.yellow(`  Listening stats skipped: ${describeError(error)}`));

		return 'warned';
	}
}

// wrangler reports API failures on stdout, which the error's own message leaves out
function describeError(error: unknown): string {
	if (error instanceof Error && 'stdout' in error && typeof error.stdout === 'string') {
		const output = error.stdout.trim();

		if (output) return `${error.message}\n${output}`;
	}

	return String(error);
}

// Written beside the target and renamed, so a build never reads half a file
async function writeSnapshot(filePath: string, snapshot: ListensSnapshot): Promise<void> {
	const temporaryPath = `${filePath}.tmp`;

	await mkdir(path.dirname(filePath), { recursive: true });
	await writeFile(temporaryPath, JSON.stringify(snapshot));
	await rename(temporaryPath, filePath);
}
