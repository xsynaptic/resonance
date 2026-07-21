#!/usr/bin/env tsx
import chalk from 'chalk';
import { parseArgs } from 'node:util';
import { $ } from 'zx';

import { generateRenditions } from '../audio/renditions.js';
import { validateAudio } from '../audio/validate.js';
import { ensureSshKeychain, findWorkspaceRoot } from '../shared/utils.js';
import { deployApp } from './deploy-app.js';
import { deployAudio } from './deploy-audio.js';
import { loadDeployConfig, printDeployConfig } from './deploy-config.js';
import { pullStats } from './stats-pull.js';

const rootPath = findWorkspaceRoot();

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

async function healthCheck(validatedFiles: Array<string>): Promise<void> {
	console.log(chalk.blue(`Health check: ${config.siteUrl}`));

	const siteResponse = await fetch(config.siteUrl);
	if (!siteResponse.ok) {
		throw new Error(
			`Site health check failed: ${String(siteResponse.status)} ${siteResponse.statusText}`,
		);
	}
	console.log(chalk.green(`  Site OK (${String(siteResponse.status)})`));

	const probeFile = validatedFiles[0];
	if (probeFile === undefined) {
		console.log(chalk.yellow('  No audio files to probe; skipping files health check'));
		return;
	}

	const probeUrl = `${config.filesUrl}artifacts/${encodeURIComponent(probeFile)}`;
	console.log(chalk.blue(`Health check: ${probeUrl}`));

	const filesResponse = await fetch(probeUrl, { headers: { Range: 'bytes=0-1' } });

	if (filesResponse.status !== 206) {
		throw new Error(`Audio Range probe expected 206, got ${String(filesResponse.status)}`);
	}

	const acceptRanges = filesResponse.headers.get('accept-ranges');
	if (acceptRanges !== 'bytes') {
		throw new Error(`Audio probe missing 'Accept-Ranges: bytes' (got '${String(acceptRanges)}')`);
	}

	const contentType = filesResponse.headers.get('content-type') ?? '';
	if (!contentType.startsWith('audio/')) {
		throw new Error(`Audio probe Content-Type is not audio/* (got '${contentType}')`);
	}

	console.log(chalk.green('  Files OK (206, Accept-Ranges: bytes, audio/*)'));
}

try {
	await ensureSshKeychain();

	// Fail fast: a deploy must never publish a page whose download links are dead
	const validatedFiles = await validateAudio({ rootPath });

	await generateRenditions({ dryRun: isDryRun, rootPath });

	// Soft-fail by design: fresh counts are nice, a deploy blocked on them is not
	await pullStats({ dryRun: isDryRun, rootPath });

	await build();

	// Audio before site: new pages must never go live while their files are still uploading
	await deployAudio({ dryRun: isDryRun, rootPath });
	await deployApp({ dryRun: isDryRun, rootPath });

	if (isDryRun) {
		console.log(chalk.yellow('Skipping health checks (dry run)'));
	} else {
		await healthCheck(validatedFiles);
	}

	console.log(chalk.green('Deploy complete'));
} catch (error) {
	console.error(chalk.red('Deploy failed:'), error);
	process.exit(1);
}
