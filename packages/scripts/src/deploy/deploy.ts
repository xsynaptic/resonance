#!/usr/bin/env node
import { fetchWithRetry, formatError, log, runChild, withStep } from '@xsynaptic/astro-scripts';
import chalk from 'chalk';
import path from 'node:path';
import tls from 'node:tls';

import type { DeployedAudio } from '#deploy/deploy-audio.ts';
import type { DeployConfig } from '#deploy/deploy-config.ts';

import { generateBands } from '#audio/bands.ts';
import { generateAudioManifest, readManifestFiles } from '#audio/manifest.ts';
import { generateRenditions } from '#audio/renditions.ts';
import { validateAudio } from '#audio/validate.ts';
import { generateWaveforms } from '#audio/waveforms.ts';
import { backupIfStale } from '#backup/backup.ts';
import { moderateComments } from '#comments/moderate.ts';
import { pullComments } from '#comments/pull.ts';
import { deployApp } from '#deploy/deploy-app.ts';
import { deployAudio, reapDerivedAudio } from '#deploy/deploy-audio.ts';
import { loadDeployConfig, printDeployConfig } from '#deploy/deploy-config.ts';
import { pullStats } from '#deploy/stats-pull.ts';
import { pullMixcloudStats } from '#platform-stats/mixcloud-stats.ts';
import { pullSoundcloudStats } from '#platform-stats/soundcloud-stats.ts';
import { runCommand } from '#shared/command.ts';
import { readKey } from '#shared/prompt.ts';
import { pullListens } from '#stats/listens-pull.ts';

interface HealthCheckFiles {
	originals: Array<string>;
	renditions: Array<string>;
	waveformFiles: Array<string>;
}

interface StepFlags {
	isSkipBuild: boolean;
	isSkipCheck: boolean;
	isSkipSmoke: boolean;
	rootPath: string;
}

interface MediaProbeBatch {
	contentTypePrefix: string;
	names: Array<string>;
	pathPrefix: string;
}

// Matches an entry in UA_BLOCKLIST in deploy/stats/download-stats.py
const probeUserAgent = 'resonance-deploy-probe';

// certbot renews at 30 days, so fewer than this means the renewal timer has been failing for a week
const certificateWarningDays = 21;

async function build({ isSkipBuild, rootPath }: StepFlags): Promise<void> {
	if (isSkipBuild) {
		log.warn('Skipping build');
		return;
	}
	await runChild('Building', ['pnpm', '--silent', '-C', 'packages/scripts', 'build'], {
		cwd: rootPath,
	});
}

// `pnpm build` carries none of the gate, so this is the only type check a deploy runs
// Placed after the pulls so it checks the same content the build will read
async function check({ isSkipBuild, isSkipCheck, rootPath }: StepFlags): Promise<void> {
	if (isSkipBuild || isSkipCheck) {
		log.warn('Skipping checks');
		return;
	}
	await runChild('Checking', ['pnpm', 'check'], { cwd: rootPath });
}

// Let's Encrypt no longer sends expiry mail, so this is the only signal a stalled renewal leaves
async function checkCertificate(config: DeployConfig): Promise<void> {
	const host = new URL(config.filesUrl).hostname;

	await withStep(`Health check: ${host} certificate`, async (step) => {
		try {
			const validTo = await peerCertificateValidTo(host);
			const daysRemaining = Math.floor((Date.parse(validTo) - Date.now()) / 86_400_000);

			if (Number.isNaN(daysRemaining)) {
				throw new TypeError(`Unreadable 'valid_to' on the peer certificate: '${validTo}'`);
			}
			if (daysRemaining < certificateWarningDays) {
				step.warn(
					`Certificate expires in ${String(daysRemaining)} days; check certbot.timer on the box`,
				);
				return;
			}

			log.success(`Certificate OK (${String(daysRemaining)} days remaining)`);
		} catch (error) {
			// Warn-only: an expired certificate already fails the stats pull and the audio probe
			step.warn(`Certificate unread: ${formatError(error)}`);
		}
	});
}

async function healthCheck(
	{ originals, renditions, waveformFiles }: HealthCheckFiles,
	config: DeployConfig,
): Promise<void> {
	log.step(`Health check: ${config.siteUrl}`);

	const siteResponse = await fetchWithRetry(config.siteUrl, { label: 'site', timeoutMs: 15_000 });
	if (!siteResponse.ok) {
		throw new Error(
			`Site health check failed: ${String(siteResponse.status)} ${siteResponse.statusText}`,
		);
	}
	log.success(`Site OK (${String(siteResponse.status)})`);

	await checkCertificate(config);

	if (waveformFiles.length === 0 && originals.length === 0 && renditions.length === 0) {
		log.warn('No audio files to probe; skipping files health check');
		return;
	}

	await probeAll(config, {
		contentTypePrefix: 'audio/',
		names: originals,
		pathPrefix: 'artifacts/',
	});

	// Each is served from its own location block, so probing one proves nothing about the others
	await probeAll(config, {
		contentTypePrefix: 'audio/mp4',
		names: renditions,
		pathPrefix: 'stream/',
	});

	// The only check that `gzip off` held: with gzip on, this answers 200 and the panel goes blank
	await probeAll(config, {
		contentTypePrefix: 'application/octet-stream',
		names: waveformFiles,
		pathPrefix: 'waveform/',
	});
}

function peerCertificateValidTo(host: string): Promise<string> {
	return new Promise((resolve, reject) => {
		const socket = tls.connect({ host, port: 443 }, () => {
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

// Stays a GET: nginx answers a HEAD with 200 and no `Content-Range`, defeating the probe
async function probeAll(
	config: DeployConfig,
	{ contentTypePrefix, names, pathPrefix }: MediaProbeBatch,
): Promise<void> {
	for (const name of names) {
		const url = `${config.filesUrl}${pathPrefix}${encodeURIComponent(name)}`;

		log.step(`Health check: ${url}`);

		const response = await fetchWithRetry(url, {
			headers: { Range: 'bytes=0-1', 'User-Agent': probeUserAgent },
			label: `range probe ${pathPrefix}${name}`,
			timeoutMs: 15_000,
		});

		// Cancelled rather than read: a gzip regression answers 200 with the whole file
		await response.body?.cancel();

		if (response.status !== 206) {
			throw new Error(`Range probe expected 206, got ${String(response.status)}: ${url}`);
		}

		// nginx omits Accept-Ranges from a 206, so Content-Range is the proof
		const contentRange = response.headers.get('content-range');
		if (contentRange === null) {
			throw new TypeError(`Range probe returned 206 without a 'Content-Range' header: ${url}`);
		}

		const contentType = response.headers.get('content-type');
		if (!contentType?.startsWith(contentTypePrefix)) {
			throw new Error(
				`Range probe Content-Type is not ${contentTypePrefix}* (got '${String(contentType)}'): ${url}`,
			);
		}

		log.success(`${name} OK (206, ${contentRange}, ${contentType})`);
	}
}

function probeSample(uploaded: Array<string>, fallback: Array<string>): Array<string> {
	const names = uploaded.length > 0 ? uploaded : fallback;
	const firstByExtension = new Map<string, string>();

	for (const name of names) {
		const extension = path.extname(name);

		if (!firstByExtension.has(extension)) firstByExtension.set(extension, name);
	}

	return [...firstByExtension.values()];
}

async function promptPendingComments(
	pending: number | undefined,
	{ isDryRun, rootPath }: { isDryRun: boolean; rootPath: string },
): Promise<'continue' | 'quit'> {
	// Nothing to ask about: no pending rows, or no reachable D1 to have counted them
	if (!pending) return 'continue';

	return withStep('Reviewing pending comments', async (step) => {
		const pendingDetail = `${String(pending)} awaiting moderation`;

		// Moderation statuses are one-way: a rehearsal must not spend them, and a non-TTY cannot ask
		if (isDryRun || !process.stdin.isTTY) {
			step.warn(pendingDetail);
			return 'continue';
		}

		log.info(
			`  ${chalk.bold.white('m')} ${chalk.dim('moderate now')}   ${chalk.bold.white('c')} ${chalk.dim('continue')}   ${chalk.bold.white('q')} ${chalk.dim('quit')}`,
		);

		const key = await readKey(['c', 'm', 'q']);

		if (key === undefined || key === 'q') {
			step.skip('deploy stopped');
			return 'quit';
		}

		if (key === 'm') {
			const tally = await moderateComments({ isLocal: false, rootPath });

			// Quitting the queue breaks out untallied, so measure what was decided, not what was skipped
			if (tally.approved + tally.rejected + tally.spam === pending) return 'continue';
		}

		step.warn(pendingDetail);
		return 'continue';
	});
}

async function deriveAudio({
	isDryRun,
	rootPath,
}: {
	isDryRun: boolean;
	rootPath: string;
}): Promise<Array<string>> {
	// Fail fast: a deploy must never publish a page whose download links are dead
	const validatedFiles = await validateAudio({ rootPath });

	// Fatal, since a warned rendition publishes a page with nothing to play
	// The manifest runs last because it records what the steps above produced
	await generateRenditions({ dryRun: isDryRun, rootPath });
	await generateWaveforms({ dryRun: isDryRun, rootPath });
	await generateBands({ dryRun: isDryRun, rootPath });
	await generateAudioManifest({ dryRun: isDryRun, rootPath });

	return validatedFiles;
}

// Soft-fail by design: fresh counts are nice, a deploy blocked on them is not
async function pullSoftSteps(
	config: DeployConfig,
	{ isDryRun, rootPath }: { isDryRun: boolean; rootPath: string },
): Promise<void> {
	await pullStats({ config, dryRun: isDryRun, rootPath });
	await pullMixcloudStats({ dryRun: isDryRun, rootPath });
	await pullSoundcloudStats({ dryRun: isDryRun, rootPath });
	await pullListens({ dryRun: isDryRun, rootPath });
	await backupIfStale({ dryRun: isDryRun, rootPath });
}

// Runs in a dry run too, since it reads the build and touches nothing remote
async function smoke({ isSkipSmoke, rootPath }: StepFlags): Promise<void> {
	if (isSkipSmoke) {
		log.warn('Skipping smoke suite');
		return;
	}
	await runChild('Running the smoke suite', ['pnpm', 'test-e2e-smoke'], { cwd: rootPath });
}

async function verifyLive(
	config: DeployConfig,
	{
		isDryRun,
		rootPath,
		uploaded,
		validatedFiles,
	}: {
		isDryRun: boolean;
		rootPath: string;
		uploaded: DeployedAudio;
		validatedFiles: Array<string>;
	},
): Promise<void> {
	await withStep('Checking the live site', async (step) => {
		if (isDryRun) {
			step.skip('dry run');
			return;
		}

		const manifest = await readManifestFiles(rootPath);

		// Prefers what this run uploaded; a no-op run falls back to whatever the manifest names
		await healthCheck(
			{
				originals: probeSample(uploaded.originals, validatedFiles),
				renditions: probeSample(uploaded.renditions, manifest.streams),
				waveformFiles: probeSample(uploaded.waveformFiles, manifest.waveformFiles),
			},
			config,
		);
	});
}

// The build lets a broken id through as unlinked text or a dropped item, so this is the only gate
async function validate({ rootPath }: StepFlags): Promise<void> {
	await runChild('Syncing content', ['pnpm', 'exec', 'astro', 'sync'], { cwd: rootPath });
	await runChild(
		'Validating content',
		['pnpm', '--silent', '-C', 'packages/scripts', 'validate-content'],
		{ cwd: rootPath },
	);
}

await runCommand({
	name: 'deploy-site',
	options: {
		'dry-run': {
			default: false,
			description: 'Run every local step; rsync, ssh and wrangler only report what they would do',
			type: 'boolean',
		},
		'skip-build': {
			default: false,
			description: 'Deploy the existing dist; also skips the checks',
			type: 'boolean',
		},
		'skip-check': { default: false, description: 'Skip `pnpm check`', type: 'boolean' },
		'skip-smoke': { default: false, description: 'Skip the E2E smoke suite', type: 'boolean' },
	},
	async run({ rootPath, values }) {
		const isDryRun = values['dry-run'];
		const flags: StepFlags = {
			isSkipBuild: values['skip-build'],
			isSkipCheck: values['skip-check'],
			isSkipSmoke: values['skip-smoke'],
			rootPath,
		};
		const config = loadDeployConfig();

		printDeployConfig(config);

		const validatedFiles = await deriveAudio({ isDryRun, rootPath });

		await pullSoftSteps(config, { isDryRun, rootPath });

		const pending = await pullComments({ allowStale: true, rootPath });

		// Before the build, so moderating here reaches the same deploy
		// Nothing is deployed yet, so a deliberate stop exits clean rather than throwing
		if ((await promptPendingComments(pending, { isDryRun, rootPath })) === 'quit') return;

		await validate(flags);
		await check(flags);
		await build(flags);
		await smoke(flags);

		// Audio before site: new pages must never go live while their files are still uploading
		const uploaded = await deployAudio({ config, dryRun: isDryRun, rootPath });
		await deployApp({ dryRun: isDryRun, rootPath });

		// Only now is the generation the old pages named unreachable
		await reapDerivedAudio({ config, dryRun: isDryRun, rootPath });

		await verifyLive(config, { isDryRun, rootPath, uploaded, validatedFiles });

		log.success('Deploy complete');
	},
	summary: 'Derive audio, pull stats and comments, gate, build, then ship audio and the site',
	title: 'Deploy site',
});
