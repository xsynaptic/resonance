import chalk from 'chalk';
import path from 'node:path';

import type { DeployConfig } from './deploy-config.js';

import { loadDeployConfig } from './deploy-config.js';
import { rsyncTo, sshExec } from './rsync-exec.js';

interface DeployServerConfigOptions {
	dryRun?: boolean;
	rootPath: string;
}

// Apply never --delete, so files the host owns stay untouched
export async function deployServerConfig(options: DeployServerConfigOptions): Promise<void> {
	const { dryRun = false, rootPath } = options;

	const config = loadDeployConfig();

	const deployDir = path.join(rootPath, 'deploy');
	const { remoteHost, remoteNginxSitesPath, remoteServerConfigPath } = config;

	console.log(chalk.blue('Deploying server config...'));
	console.log(
		chalk.gray(
			`  nginx: ${deployDir}/nginx/sites-enabled/ -> ${remoteHost}:${remoteNginxSitesPath}/`,
		),
	);
	console.log(chalk.gray(`  stats: ${deployDir}/stats/ -> ${remoteHost}:/usr/local/bin/`));
	console.log(chalk.gray(`  units: ${deployDir}/systemd/ -> ${remoteHost}:/etc/systemd/system/`));

	if (dryRun) console.log(chalk.yellow('  DRY RUN'));

	const start = Date.now();

	await rsyncTo(`${deployDir}/nginx/`, `${remoteHost}:${remoteServerConfigPath}/nginx/`, {
		config,
		dryRun,
	});
	await rsyncTo(`${deployDir}/stats/`, `${remoteHost}:${remoteServerConfigPath}/stats/`, {
		config,
		dryRun,
		excludes: ['fixtures', 'test-*.py', '__pycache__'],
	});
	await rsyncTo(`${deployDir}/systemd/`, `${remoteHost}:${remoteServerConfigPath}/systemd/`, {
		config,
		dryRun,
	});

	await sshExec(config, applyNginxSites(config), { dryRun });

	// Separate from nginx so a failure in one does not strand the other half-applied
	// `daemon-reload` picks up unit edits; the timer is enabled once by hand on first provision
	await sshExec(
		config,
		[
			`sudo rsync -av --chown=root:root ${remoteServerConfigPath}/stats/download-stats.py /usr/local/bin/download-stats.py`,
			`sudo rsync -av --chown=root:root ${remoteServerConfigPath}/systemd/ /etc/systemd/system/`,
			`sudo systemctl daemon-reload`,
		].join(' && '),
		{ dryRun },
	);

	console.log(chalk.green(`Done in ${((Date.now() - start) / 1000).toFixed(1)}s`));
}

function applyNginxSites(config: DeployConfig): string {
	const { remoteNginxSitesOwner, remoteNginxSitesPath, remoteServerConfigPath } = config;

	const stagedPath = `${remoteServerConfigPath}/nginx/sites-enabled`;

	return [
		`set -e`,
		`backup=$(mktemp -d)`,
		`for staged in ${stagedPath}/*; do`,
		`  name=$(basename "$staged")`,
		`  live="${remoteNginxSitesPath}/$name"`,
		`  if [ -e "$live" ]; then sudo cp -a "$live" "$backup/$name"; fi`,
		`done`,
		`sudo rsync -av --chown=${remoteNginxSitesOwner} ${stagedPath}/ ${remoteNginxSitesPath}/`,
		`if sudo nginx -t; then`,
		`  sudo systemctl reload nginx`,
		`  sudo rm -rf "$backup"`,
		`else`,
		`  for staged in ${stagedPath}/*; do`,
		`    name=$(basename "$staged")`,
		`    live="${remoteNginxSitesPath}/$name"`,
		`    if [ -e "$backup/$name" ]; then sudo mv "$backup/$name" "$live"; else sudo rm -f "$live"; fi`,
		`  done`,
		`  echo "nginx -t failed; ${remoteNginxSitesPath} rolled back, nginx untouched"`,
		`  sudo nginx -t`,
		`  exit 1`,
		`fi`,
	].join('\n');
}
