#!/usr/bin/env tsx
import chalk from 'chalk';
import tls from 'node:tls';
import { parseArgs } from 'node:util';
import { $ } from 'zx';

import { generateRenditions } from '../audio/renditions.js';
import { validateAudio } from '../audio/validate.js';
import { generateWaveforms } from '../audio/waveforms.js';
import { backupIfStale } from '../comments/backup.js';
import { printPendingCount } from '../comments/moderate.js';
import { pullMixcloudStats } from '../mixcloud/mixcloud-stats.js';
import { generateOpenGraphImages } from '../og-image/og-image.js';
import { findWorkspaceRoot } from '../shared/utils.js';
import { generateSitemapLastmod } from '../sitemap-lastmod/index.js';
import { deployApp } from './deploy-app.js';
import { deployAudio } from './deploy-audio.js';
import { loadDeployConfig, printDeployConfig } from './deploy-config.js';
import { pullStats } from './stats-pull.js';

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

// Let's Encrypt no longer sends expiry mail, so this is the only signal a stalled renewal leaves
async function checkCertificate(): Promise<void> {
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
			return;
		}

		console.log(chalk.green(`  Certificate OK (${String(daysRemaining)} days remaining)`));
	} catch (error) {
		// Warn-only: an expired certificate already fails the stats pull and the audio probe
		console.warn(chalk.yellow(`  Certificate check skipped: ${String(error)}`));
	}
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

	await checkCertificate();

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

	// After generateRedirects, which runs `astro sync`, so the data store is warm
	await generateSitemapLastmod({ rootPath, siteUrl: config.siteUrl });

	await build();

	// After the build: dist decides which cards exist, and receives them for deploy-app to ship
	await generateOpenGraphImages({ rootPath });

	// Audio before site: new pages must never go live while their files are still uploading
	const uploaded = await deployAudio({ config, dryRun: isDryRun, rootPath });
	await deployApp({ dryRun: isDryRun, rootPath });

	if (isDryRun) {
		console.log(chalk.yellow('Skipping health checks (dry run)'));
	} else {
		// Probe everything this run put on the box; a no-op run falls back to any one referenced file
		await healthCheck(uploaded.length > 0 ? uploaded : validatedFiles.slice(0, 1));
	}

	console.log(chalk.green('Deploy complete'));
} catch (error) {
	console.error(chalk.red('Deploy failed:'), error);
	process.exit(1);
}
