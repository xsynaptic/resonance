#!/usr/bin/env tsx
import chalk from 'chalk';
import tls from 'node:tls';
import { parseArgs } from 'node:util';
import { $ } from 'zx';

import type { StepStatus } from '../shared/step-status.js';

import { generateRenditions } from '../audio/renditions.js';
import { validateAudio } from '../audio/validate.js';
import { generateWaveforms } from '../audio/waveforms.js';
import { backupIfStale } from '../comments/backup.js';
import { pullComments } from '../comments/pull.js';
import { pullMixcloudStats } from '../platform-stats/mixcloud-stats.js';
import { pullSoundcloudStats } from '../platform-stats/soundcloud-stats.js';
import { findWorkspaceRoot } from '../shared/utils.js';
import { deployApp } from './deploy-app.js';
import { deployAudio } from './deploy-audio.js';
import { loadDeployConfig, printDeployConfig } from './deploy-config.js';
import { pullStats } from './stats-pull.js';

interface WarnOnlyStep {
	label: string;
	status: StepStatus;
}

const rootPath = findWorkspaceRoot();

// Matches an entry in UA_BLOCKLIST in deploy/stats/download-stats.py
const probeUserAgent = 'resonance-deploy-probe';

// certbot renews at 30 days, so fewer than this means the renewal timer has been failing for a week
const certificateWarningDays = 21;

const { values } = parseArgs({
	args: process.argv.slice(2),
	options: {
		'dry-run': { default: false, type: 'boolean' },
		'skip-build': { default: false, type: 'boolean' },
		'skip-check': { default: false, type: 'boolean' },
	},
});

const isDryRun = values['dry-run'];
const isSkipBuild = values['skip-build'];
const isSkipCheck = values['skip-check'];

const warnOnlySteps: Array<WarnOnlyStep> = [];

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

// `astro check` is all of the gate `pnpm build` carries; lint, vitest and knip only run here
// Placed after the pulls so it checks the same content the build will read
async function check(): Promise<void> {
	if (isSkipBuild || isSkipCheck) {
		console.log(chalk.yellow('Skipping checks'));
		return;
	}
	console.log(chalk.blue('Checking...'));
	await $({ cwd: rootPath, stdio: 'inherit' })`pnpm check`;
}

// Let's Encrypt no longer sends expiry mail, so this is the only signal a stalled renewal leaves
async function checkCertificate(): Promise<StepStatus> {
	const host = new URL(config.filesUrl).hostname;

	console.log(chalk.blue(`Health check: ${host} certificate`));

	try {
		const validTo = await peerCertificateValidTo(host);
		const daysRemaining = Math.floor((Date.parse(validTo) - Date.now()) / 86_400_000);

		if (Number.isNaN(daysRemaining)) {
			throw new TypeError(`Unreadable 'valid_to' on the peer certificate: '${validTo}'`);
		}
		if (daysRemaining < certificateWarningDays) {
			console.warn(
				chalk.yellow(
					`  Certificate expires in ${String(daysRemaining)} days; check certbot.timer on the box`,
				),
			);
			return 'warned';
		}

		console.log(chalk.green(`  Certificate OK (${String(daysRemaining)} days remaining)`));
		return 'ok';
	} catch (error) {
		// Warn-only: an expired certificate already fails the stats pull and the audio probe
		console.warn(chalk.yellow(`  Certificate check skipped: ${String(error)}`));
		return 'warned';
	}
}

function formatStep({ label, status }: WarnOnlyStep): string {
	if (status === 'ok') return chalk.green(`  ✓ ${label}`);
	if (status === 'skipped') return chalk.gray(`  – ${label} (skipped)`);

	return chalk.yellow(`  ⚠ ${label}`);
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

	recordStep('Certificate', await checkCertificate());

	if (probeFiles.length === 0) {
		console.log(chalk.yellow('  No audio files to probe; skipping files health check'));
		return;
	}

	for (const probeFile of probeFiles) {
		await probeAudio(probeFile);
	}
}

function peerCertificateValidTo(host: string): Promise<string> {
	return new Promise((resolve, reject) => {
		const socket = tls.connect({ host, port: 443, servername: host }, () => {
			const validTo = socket.getPeerCertificate().valid_to;

			socket.end();
			resolve(validTo);
		});

		socket.setTimeout(15_000, () => {
			socket.destroy(new Error(`TLS connection to ${host} timed out`));
		});
		socket.on('error', reject);
	});
}

// One block at the end: a step that warns mid-run is one yellow line in a multi-minute log
function printWarnOnlySummary(): void {
	const warned = warnOnlySteps.filter((step) => step.status === 'warned');

	console.log(chalk.blue('\nWarn-only steps:'));
	for (const step of warnOnlySteps) console.log(formatStep(step));

	if (warned.length === 0) return;

	console.log(
		chalk.yellow(
			`  ${String(warned.length)} of ${String(warnOnlySteps.length)} need attention: ${warned.map((step) => step.label).join(', ')}`,
		),
	);
}

async function probeAudio(probeFile: string): Promise<void> {
	const probeUrl = `${config.filesUrl}artifacts/${encodeURIComponent(probeFile)}`;

	console.log(chalk.blue(`Health check: ${probeUrl}`));

	// Stays a GET; nginx logs `$body_bytes_sent` as 0 for a HEAD, and credits come from bytes
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

function recordStep(label: string, status: StepStatus): void {
	warnOnlySteps.push({ label, status });
}

async function runWarnOnly(label: string, step: () => Promise<void>): Promise<void> {
	try {
		await step();
		recordStep(label, 'ok');
	} catch (error) {
		console.warn(chalk.yellow(`${label} skipped: ${String(error)}`));
		recordStep(label, 'warned');
	}
}

try {
	// Fail fast: a deploy must never publish a page whose download links are dead
	const validatedFiles = await validateAudio({ rootPath });

	// Warn-only alongside waveforms: neither has a consumer yet, and neither may block a text deploy
	await runWarnOnly('Renditions', () => generateRenditions({ dryRun: isDryRun, rootPath }));
	await runWarnOnly('Waveforms', () => generateWaveforms({ dryRun: isDryRun, rootPath }));

	// Soft-fail by design: fresh counts are nice, a deploy blocked on them is not
	recordStep('Download stats', await pullStats({ config, dryRun: isDryRun, rootPath }));
	recordStep('Mixcloud stats', await pullMixcloudStats({ dryRun: isDryRun, rootPath }));
	recordStep('SoundCloud stats', await pullSoundcloudStats({ dryRun: isDryRun, rootPath }));

	recordStep('Comment backup', await backupIfStale(rootPath));
	await pullComments({ allowStale: true, rootPath });

	await check();
	await build();

	// Audio before site: new pages must never go live while their files are still uploading
	const uploaded = await deployAudio({ config, dryRun: isDryRun, rootPath });
	await deployApp({ dryRun: isDryRun, rootPath });

	if (isDryRun) {
		console.log(chalk.yellow('Skipping health checks (dry run)'));
		recordStep('Certificate', 'skipped');
	} else {
		// Probe everything this run put on the box; a no-op run falls back to any one referenced file
		await healthCheck(uploaded.length > 0 ? uploaded : validatedFiles.slice(0, 1));
	}

	printWarnOnlySummary();

	console.log(chalk.green('Deploy complete'));
} catch (error) {
	console.error(chalk.red('Deploy failed:'), error);
	process.exit(1);
}
