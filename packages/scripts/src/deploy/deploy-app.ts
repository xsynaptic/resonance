import chalk from 'chalk';
import fs from 'node:fs/promises';
import path from 'node:path';
import { $ } from 'zx';

import { isPathPresent } from '../shared/utils.js';

// Cloudflare Workers free tier allows 20,000 assets per version and 25 MiB per asset
const FILE_COUNT_ERROR = 19_500;
const FILE_COUNT_WARN = 15_000;
const ASSET_SIZE_WARN = 25 * 1024 * 1024;

interface DeployAppOptions {
	dryRun?: boolean;
	rootPath: string;
}

export async function deployApp(options: DeployAppOptions): Promise<void> {
	const { dryRun = false, rootPath } = options;

	const distPath = path.join(rootPath, 'dist');

	if (!(await isPathPresent(distPath))) {
		throw new Error(`dist/ not found at ${distPath}. Run \`pnpm build\` (or omit --skip-build).`);
	}

	const relativePaths = await fs.readdir(distPath, { recursive: true });

	const stats = await Promise.all(
		relativePaths.map(async (relativePath) => {
			const stat = await fs.stat(path.join(distPath, relativePath));
			return { isFile: stat.isFile(), relativePath, size: stat.size };
		}),
	);

	const files = stats.filter((entry) => entry.isFile);
	const fileCount = files.length;
	const largeFiles = files.filter((entry) => entry.size >= ASSET_SIZE_WARN);

	console.log(chalk.blue('Deploying site to Cloudflare Workers...'));
	console.log(chalk.gray(`  Assets: ${String(fileCount)}`));

	if (fileCount >= FILE_COUNT_ERROR) {
		throw new Error(
			`dist/ has ${String(fileCount)} files, over the ${String(FILE_COUNT_ERROR)} safety threshold (Workers cap is 20,000/version).`,
		);
	}

	if (fileCount >= FILE_COUNT_WARN) {
		console.log(
			chalk.yellow(`  Warning: ${String(fileCount)} files approaches the 20,000 Workers cap`),
		);
	}

	for (const large of largeFiles) {
		const mib = (large.size / 1024 / 1024).toFixed(1);
		console.log(
			chalk.yellow(`  Warning: ${large.relativePath} is ${mib} MiB (25 MiB per-asset limit)`),
		);
	}

	if (dryRun) console.log(chalk.yellow('  DRY RUN'));

	const start = Date.now();

	const wranglerArgs = dryRun ? ['deploy', '--dry-run'] : ['deploy'];

	await $({ cwd: rootPath, stdio: 'inherit' })`pnpm exec wrangler ${wranglerArgs}`;

	console.log(chalk.green(`Done in ${((Date.now() - start) / 1000).toFixed(1)}s`));
}
