#!/usr/bin/env tsx
import type { IncomingHttpHeaders } from 'node:http';

import chalk from 'chalk';
import https from 'node:https';
import net from 'node:net';
import tls from 'node:tls';
import { parseArgs } from 'node:util';
import { $ } from 'zx';

import type { StepStatus } from '#shared/step-status.ts';

import { generateAudioManifest, readManifestFiles } from '#audio/manifest.ts';
import { generateRenditions } from '#audio/renditions.ts';
import { validateAudio } from '#audio/validate.ts';
import { generateWaveforms } from '#audio/waveforms.ts';
import { backupIfStale } from '#comments/backup.ts';
import { pullComments } from '#comments/pull.ts';
import { deployApp } from '#deploy/deploy-app.ts';
import { deployAudio, reapDerivedAudio } from '#deploy/deploy-audio.ts';
import { loadDeployConfig, printDeployConfig } from '#deploy/deploy-config.ts';
import { pullStats } from '#deploy/stats-pull.ts';
import { pullMixcloudStats } from '#platform-stats/mixcloud-stats.ts';
import { pullSoundcloudStats } from '#platform-stats/soundcloud-stats.ts';
import { findWorkspaceRoot } from '#shared/utils.ts';

interface HealthCheckFiles {
	archives: Array<string>;
	originals: Array<string>;
	renditions: Array<string>;
}

interface MediaProbe {
	contentTypePrefix: string;
	name: string;
	url: string;
}

interface MediaProbeBatch {
	contentTypePrefix: string;
	names: Array<string>;
	pathPrefix: string;
}

interface ProbeResponse {
	headers: IncomingHttpHeaders;
	statusCode: number;
}

interface WarnOnlyStep {
	label: string;
	status: StepStatus;
}

const rootPath = findWorkspaceRoot();

// Matches an entry in UA_BLOCKLIST in deploy/stats/download-stats.py
const probeUserAgent = 'resonance-deploy-probe';

// certbot renews at 30 days, so fewer than this means the renewal timer has been failing for a week
const certificateWarningDays = 21;

// rsync already verified the transfer, so a probe is only testing the location block
// Without a cap, a run that re-derives every archive probes all 68 to prove one block works
const probeLimit = 3;

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

async function healthCheck({ archives, originals, renditions }: HealthCheckFiles): Promise<void> {
	console.log(chalk.blue(`Health check: ${config.siteUrl}`));

	const siteResponse = await fetch(config.siteUrl, { signal: AbortSignal.timeout(15_000) });
	if (!siteResponse.ok) {
		throw new Error(
			`Site health check failed: ${String(siteResponse.status)} ${siteResponse.statusText}`,
		);
	}
	console.log(chalk.green(`  Site OK (${String(siteResponse.status)})`));

	recordStep('Certificate', await checkCertificate());

	if (archives.length === 0 && originals.length === 0 && renditions.length === 0) {
		console.log(chalk.yellow('  No audio files to probe; skipping files health check'));
		return;
	}

	await probeAll({
		contentTypePrefix: 'audio/',
		names: originals,
		pathPrefix: 'artifacts/',
	});

	// Each is served from its own location block, so probing one proves nothing about the others
	await probeAll({
		contentTypePrefix: 'audio/webm',
		names: renditions,
		pathPrefix: 'stream/',
	});

	// The only check that `gzip off` held: with gzip on, this answers 200 and the panel goes blank
	await probeAll({
		contentTypePrefix: 'application/octet-stream',
		names: archives,
		pathPrefix: 'waveform/',
	});
}

// Family pinned so the check cannot silently move to v6 the day an AAAA is published
// `tls.ConnectionOptions` models no `family`, so the v4 socket is opened first and wrapped
function peerCertificateValidTo(host: string): Promise<string> {
	return new Promise((resolve, reject) => {
		const connection = net.connect({ family: 4, host, port: 443 });
		const socket = tls.connect({ servername: host, socket: connection }, () => {
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

async function probeAll({ contentTypePrefix, names, pathPrefix }: MediaProbeBatch): Promise<void> {
	for (const name of names) {
		await probeMedia({
			contentTypePrefix,
			name,
			url: `${config.filesUrl}${pathPrefix}${encodeURIComponent(name)}`,
		});
	}
}

async function probeMedia({ contentTypePrefix, name, url }: MediaProbe): Promise<void> {
	console.log(chalk.blue(`Health check: ${url}`));

	const filesResponse = await probeRange(url);

	if (filesResponse.statusCode !== 206) {
		throw new Error(`Range probe expected 206, got ${String(filesResponse.statusCode)}: ${url}`);
	}

	// nginx omits Accept-Ranges from a 206, so Content-Range is the proof
	const contentRange = filesResponse.headers['content-range'];
	if (typeof contentRange !== 'string') {
		throw new TypeError(`Range probe returned 206 without a 'Content-Range' header: ${url}`);
	}

	const contentType = filesResponse.headers['content-type'];
	if (typeof contentType !== 'string' || !contentType.startsWith(contentTypePrefix)) {
		throw new Error(
			`Range probe Content-Type is not ${contentTypePrefix}* (got '${String(contentType)}'): ${url}`,
		);
	}

	console.log(chalk.green(`  ${name} OK (206, ${contentRange}, ${contentType})`));
}

// Stays a GET; nginx logs `$body_bytes_sent` as 0 for a HEAD, and credits come from bytes
// v4 pinned against Node 24's `autoSelectFamily`, which would otherwise pick either family
function probeRange(probeUrl: string): Promise<ProbeResponse> {
	return new Promise((resolve, reject) => {
		const request = https.request(
			probeUrl,
			{
				family: 4,
				headers: { Range: 'bytes=0-1', 'User-Agent': probeUserAgent },
				method: 'GET',
				timeout: 15_000,
			},
			(response) => {
				response.resume();
				resolve({ headers: response.headers, statusCode: response.statusCode ?? 0 });
			},
		);

		request.on('timeout', () => {
			request.destroy(new Error(`Range probe to ${probeUrl} timed out`));
		});
		request.on('error', reject);
		request.end();
	});
}

function probeSample(uploaded: Array<string>, fallback: Array<string>): Array<string> {
	return (uploaded.length > 0 ? uploaded : fallback).slice(0, probeLimit);
}

function recordStep(label: string, status: StepStatus): void {
	warnOnlySteps.push({ label, status });
}

try {
	// Fail fast: a deploy must never publish a page whose download links are dead
	const validatedFiles = await validateAudio({ rootPath });

	// Fatal, since a warned rendition publishes a page with nothing to play
	// The manifest runs last because it records what the two steps above produced
	await generateRenditions({ dryRun: isDryRun, rootPath });
	await generateWaveforms({ dryRun: isDryRun, rootPath });
	await generateAudioManifest({ dryRun: isDryRun, rootPath });

	// Soft-fail by design: fresh counts are nice, a deploy blocked on them is not
	recordStep('Download stats', await pullStats({ config, dryRun: isDryRun, rootPath }));
	recordStep('Mixcloud stats', await pullMixcloudStats({ dryRun: isDryRun, rootPath }));
	recordStep('SoundCloud stats', await pullSoundcloudStats({ dryRun: isDryRun, rootPath }));

	recordStep('Comment backup', await backupIfStale({ dryRun: isDryRun, rootPath }));
	await pullComments({ allowStale: true, rootPath });

	await check();
	await build();

	// Audio before site: new pages must never go live while their files are still uploading
	const uploaded = await deployAudio({ config, dryRun: isDryRun, rootPath });
	await deployApp({ dryRun: isDryRun, rootPath });

	// Only now is the generation the old pages named unreachable
	await reapDerivedAudio({ config, dryRun: isDryRun, rootPath });

	const manifest = await readManifestFiles(rootPath);

	if (isDryRun) {
		console.log(chalk.yellow('Skipping health checks (dry run)'));
		recordStep('Certificate', 'skipped');
	} else {
		// Prefers what this run uploaded; a no-op run falls back to whatever the manifest names
		await healthCheck({
			archives: probeSample(uploaded.archives, manifest.archives),
			originals: probeSample(uploaded.originals, validatedFiles),
			renditions: probeSample(uploaded.renditions, manifest.streams),
		});
	}

	printWarnOnlySummary();

	console.log(chalk.green('Deploy complete'));
} catch (error) {
	console.error(chalk.red('Deploy failed:'), error);
	process.exit(1);
}
