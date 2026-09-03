#!/usr/bin/env tsx
import chalk from 'chalk';
import fs from 'node:fs/promises';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { $ } from 'zx';

import { audioSourceDir } from '../audio/audio-paths.js';
import { generateRenditions } from '../audio/renditions.js';
import { validateAudio } from '../audio/validate.js';
import { generateWaveforms } from '../audio/waveforms.js';
import { backupIfStale } from '../comments/backup.js';
import { printPendingCount } from '../comments/moderate.js';
import { pullMixcloudStats } from '../mixcloud/mixcloud-stats.js';
import { generateOpenGraphImages } from '../og-image/og-image.js';
import { findWorkspaceRoot } from '../shared/utils.js';
import { deployApp } from './deploy-app.js';
import { deployAudio } from './deploy-audio.js';
import { loadDeployConfig, printDeployConfig } from './deploy-config.js';
import { pullStats } from './stats-pull.js';

const rootPath = findWorkspaceRoot();

// Matches an entry in UA_BLOCKLIST in deploy/stats/download-stats.py
const probeUserAgent = 'resonance-deploy-probe';

const { values } = parseArgs({
	args: process.argv.slice(2),
	options: {
		'dry-run': { default: false, type: 'boolean' },
		'skip-build': { default: false, type: 'boolean' },
	},
});

const isDryRun = values['dry-run'];
const isSkipBuild = values['skip-build'];

const config = loadDeployConfig();

printDeployConfig(config);

async function build(): Promise<void> {
	if (isSkipBuild) {
		console.log(chalk.yellow('Skipping build'));
		return;
	}
	console.log(chalk.blue('Building...'));
	await $({ cwd: rootPath, stdio: 'inherit' })`pnpm build`;
}

// Exits non-zero on a former id colliding with a live path, which would take that page off the site
async function generateRedirects(): Promise<void> {
	console.log(chalk.blue('Generating redirects...'));
	await $({ cwd: rootPath, stdio: 'inherit' })`pnpm generate-redirects`;
}

async function healthCheck(probeFiles: Array<string>): Promise<void> {
	console.log(chalk.blue(`Health check: ${config.siteUrl}`));

	const siteResponse = await fetch(config.siteUrl, { signal: AbortSignal.timeout(15_000) });
	if (!siteResponse.ok) {
		throw new Error(
			`Site health check failed: ${String(siteResponse.status)} ${siteResponse.statusText}`,
		);
	}
	console.log(chalk.green(`  Site OK (${String(siteResponse.status)})`));

	const probeFile = await smallestFile(probeFiles);

	if (probeFile === undefined) {
		console.log(chalk.yellow('  No audio files to probe; skipping files health check'));
		return;
	}

	await probeAudio(probeFile);
}

async function probeAudio(probeFile: string): Promise<void> {
	const probeUrl = `${config.filesUrl}artifacts/${encodeURIComponent(probeFile)}`;

	console.log(chalk.blue(`Health check: ${probeUrl}`));

	// Named so the aggregator's UA blocklist can drop it, along with Cloudflare's full-object
	// fetch of the same file, which forwards this header
	const filesResponse = await fetch(probeUrl, {
		headers: { Range: 'bytes=0-1', 'User-Agent': probeUserAgent },
		signal: AbortSignal.timeout(15_000),
	});

	if (filesResponse.status !== 206) {
		throw new Error(
			`Audio Range probe expected 206, got ${String(filesResponse.status)}: ${probeUrl}`,
		);
	}

	// nginx omits Accept-Ranges from a 206, so Content-Range is the proof
	const contentRange = filesResponse.headers.get('content-range');
	if (contentRange === null) {
		throw new Error(`Audio probe returned 206 without a 'Content-Range' header: ${probeUrl}`);
	}

	const contentType = filesResponse.headers.get('content-type') ?? '';
	if (!contentType.startsWith('audio/')) {
		throw new Error(`Audio probe Content-Type is not audio/* (got '${contentType}'): ${probeUrl}`);
	}

	console.log(chalk.green(`  ${probeFile} OK (206, ${contentRange}, ${contentType})`));
}

// Cloudflare answers a range request by pulling the whole object from the origin
// A 2-byte probe costs a full transfer; probe once, against the cheapest file
async function smallestFile(files: Array<string>): Promise<string | undefined> {
	const sized = await Promise.all(
		files.map(async (file) => {
			const stat = await fs.stat(path.join(rootPath, audioSourceDir, file));
			return { file, size: stat.size };
		}),
	);

	return sized.sort((left, right) => left.size - right.size)[0]?.file;
}

try {
	// Fail fast: a deploy must never publish a page whose download links are dead
	const validatedFiles = await validateAudio({ rootPath });

	// Warn-only alongside waveforms: neither has a consumer yet, and neither may block a text deploy
	try {
		await generateRenditions({ dryRun: isDryRun, rootPath });
	} catch (error) {
		console.warn(chalk.yellow(`Renditions skipped: ${String(error)}`));
	}

	try {
		await generateWaveforms({ dryRun: isDryRun, rootPath });
	} catch (error) {
		console.warn(chalk.yellow(`Waveforms skipped: ${String(error)}`));
	}

	// Soft-fail by design: fresh counts are nice, a deploy blocked on them is not
	await pullStats({ config, dryRun: isDryRun, rootPath });
	await pullMixcloudStats({ dryRun: isDryRun, rootPath });

	await backupIfStale(rootPath);
	await printPendingCount(rootPath);

	// Before the build, which copies public/ into the dist/ that deploy-app ships
	await generateRedirects();

	await build();

	// After the build, because the cards are published into the dist/ that deploy-app ships
	await generateOpenGraphImages({ rootPath });

	// Audio before site: new pages must never go live while their files are still uploading
	const uploaded = await deployAudio({ config, dryRun: isDryRun, rootPath });
	await deployApp({ dryRun: isDryRun, rootPath });

	if (isDryRun) {
		console.log(chalk.yellow('Skipping health checks (dry run)'));
	} else {
		// Probe what this run put on the box; a no-op run falls back to any one referenced file
		await healthCheck(uploaded.length > 0 ? uploaded : validatedFiles);
	}

	console.log(chalk.green('Deploy complete'));
} catch (error) {
	console.error(chalk.red('Deploy failed:'), error);
	process.exit(1);
}
