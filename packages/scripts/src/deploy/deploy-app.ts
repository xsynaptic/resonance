import { log, runChild } from '@xsynaptic/astro-scripts';
import fs from 'node:fs/promises';
import path from 'node:path';

import { isPathPresent } from '#shared/utils.ts';

// Cloudflare Workers free tier allows 20,000 assets per version and 25 MiB per asset
const fileCountError = 19_500;
const fileCountWarn = 15_000;
const assetSizeWarn = 25 * 1024 * 1024;

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
	const largeFiles = files.filter((entry) => entry.size >= assetSizeWarn);

	log.step('Deploying site to Cloudflare Workers...');
	log.detail(`Assets: ${String(fileCount)}`);

	if (fileCount >= fileCountError) {
		throw new Error(
			`dist/ has ${String(fileCount)} files, over the ${String(fileCountError)} safety threshold (Workers cap is 20,000/version).`,
		);
	}

	if (fileCount >= fileCountWarn) {
		log.warn(`${String(fileCount)} files approaches the 20,000 Workers cap`);
	}

	for (const large of largeFiles) {
		const mib = (large.size / 1024 / 1024).toFixed(1);
		log.warn(`${large.relativePath} is ${mib} MiB (25 MiB per-asset limit)`);
	}

	if (dryRun) log.warn('Dry run');

	const wranglerArgs = dryRun ? ['deploy', '--dry-run'] : ['deploy'];

	await runChild('Uploading to Workers', ['pnpm', 'exec', 'wrangler', ...wranglerArgs], {
		cwd: rootPath,
		filter: isWranglerSummaryLine,
	});
}

// wrangler has no flag for its per-asset `+ path` lines; `--log-level warn` would take the deploy summary with them
function isWranglerSummaryLine(line: string): boolean {
	return !line.startsWith('+ /') && !line.includes('truncating changed assets log');
}
