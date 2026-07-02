import chalk from 'chalk';
import path from 'node:path';

import { loadDeployConfig } from './deploy-config.js';
import { rsyncTo, sshExec } from './rsync-exec.js';

interface DeployServerConfigOptions {
	dryRun?: boolean;
	rootPath: string;
}

// Pushes nginx + fail2ban config to the VPS, then applies it with sudo rsync into place.
// The apply commands never --delete, so stock files (mime.types, etc.) stay untouched.
export async function deployServerConfig(options: DeployServerConfigOptions): Promise<void> {
	const { dryRun = false, rootPath } = options;

	const config = loadDeployConfig();

	const deployDir = path.join(rootPath, 'deploy');
	const { remoteHost, remoteServerConfigPath } = config;

	console.log(chalk.blue('Deploying server config...'));
	console.log(
		chalk.gray(`  nginx:    ${deployDir}/nginx/ -> ${remoteHost}:${remoteServerConfigPath}/nginx/`),
	);
	console.log(
		chalk.gray(
			`  fail2ban: ${deployDir}/fail2ban/ -> ${remoteHost}:${remoteServerConfigPath}/fail2ban/`,
		),
	);

	if (dryRun) console.log(chalk.yellow('  DRY RUN'));

	const start = Date.now();

	await rsyncTo(`${deployDir}/nginx/`, `${remoteHost}:${remoteServerConfigPath}/nginx/`, {
		config,
		dryRun,
	});
	await rsyncTo(`${deployDir}/fail2ban/`, `${remoteHost}:${remoteServerConfigPath}/fail2ban/`, {
		config,
		dryRun,
	});

	// Apply is fatal by design: a failing `nginx -t` means broken config was just pushed, and that
	// must never be masked as success. The first push to a not-yet-provisioned box fails loudly too,
	// which is expected on initial setup.
	await sshExec(
		config,
		`sudo rsync -av --chown=root:root ${remoteServerConfigPath}/nginx/ /etc/nginx/ && sudo nginx -t && sudo systemctl reload nginx`,
		{ dryRun },
	);

	await sshExec(
		config,
		`sudo rsync -av --chown=root:root ${remoteServerConfigPath}/fail2ban/ /etc/fail2ban/ && sudo systemctl reload fail2ban`,
		{ dryRun },
	);

	console.log(chalk.green(`Done in ${((Date.now() - start) / 1000).toFixed(1)}s`));
}
