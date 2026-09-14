import chalk from 'chalk';
import path from 'node:path';

import type { DeployConfig } from '#deploy/deploy-config.ts';

import { rsyncTo, sshExec } from '#deploy/rsync-exec.ts';
import { ensureSshKeychain } from '#shared/utils.ts';

// Remote server layout; the vhost beside this already names that box's IP and paths
const stagingPath = '<staging-path>';
const nginxSitesPath = '<nginx-sites-path>';
const nginxSitesOwner = '<user>:<group>';

interface DeployServerConfigOptions {
	config: DeployConfig;
	dryRun?: boolean;
	rootPath: string;
}

// Staging prunes, or a vhost renamed here is pushed live again from the copy left behind
// The apply never --delete, since the-other-vhost.conf shares the live directory with us
export async function deployServerConfig(options: DeployServerConfigOptions): Promise<void> {
	const { config, dryRun = false, rootPath } = options;

	await ensureSshKeychain();

	const deployDir = path.join(rootPath, 'deploy');
	const { remoteHost } = config;

	console.log(chalk.blue('Deploying server config...'));
	console.log(
		chalk.gray(`  nginx: ${deployDir}/nginx/sites-enabled/ -> ${remoteHost}:${nginxSitesPath}/`),
	);
	console.log(chalk.gray(`  stats: ${deployDir}/stats/ -> ${remoteHost}:/usr/local/bin/`));
	console.log(chalk.gray(`  units: ${deployDir}/systemd/ -> ${remoteHost}:/etc/systemd/system/`));

	if (dryRun) console.log(chalk.yellow('  DRY RUN'));

	const start = Date.now();

	await rsyncTo(`${deployDir}/nginx/`, `${remoteHost}:${stagingPath}/nginx/`, {
		archive: 'av',
		config,
		dryRun,
		extraFlags: ['--delete'],
	});
	await rsyncTo(`${deployDir}/stats/`, `${remoteHost}:${stagingPath}/stats/`, {
		archive: 'av',
		config,
		dryRun,
		excludes: ['fixtures', 'test-*.py', '__pycache__'],
	});
	await rsyncTo(`${deployDir}/systemd/`, `${remoteHost}:${stagingPath}/systemd/`, {
		archive: 'av',
		config,
		dryRun,
	});

	await sshExec(config, applyNginxSites(), { dryRun });

	// Separate from nginx so a failure in one does not strand the other half-applied
	// `daemon-reload` picks up unit edits; the timer is enabled once by hand on first provision
	await sshExec(
		config,
		[
			`sudo rsync -av --chown=root:root ${stagingPath}/stats/download-stats.py /usr/local/bin/download-stats.py`,
			`sudo rsync -av --chown=root:root ${stagingPath}/systemd/ /etc/systemd/system/`,
			`sudo systemctl daemon-reload`,
		].join(' && '),
		{ dryRun },
	);

	console.log(chalk.green(`Done in ${((Date.now() - start) / 1000).toFixed(1)}s`));
}

function applyNginxSites(): string {
	const stagedPath = `${stagingPath}/nginx/sites-enabled`;

	return [
		`set -e`,
		`backup=$(mktemp -d)`,
		`for staged in ${stagedPath}/*; do`,
		`  name=$(basename "$staged")`,
		`  live="${nginxSitesPath}/$name"`,
		`  if [ -e "$live" ]; then sudo cp -a "$live" "$backup/$name"; fi`,
		`done`,
		`sudo rsync -av --chown=${nginxSitesOwner} ${stagedPath}/ ${nginxSitesPath}/`,
		`if sudo nginx -t; then`,
		`  sudo systemctl reload nginx`,
		`  sudo rm -rf "$backup"`,
		`else`,
		`  for staged in ${stagedPath}/*; do`,
		`    name=$(basename "$staged")`,
		`    live="${nginxSitesPath}/$name"`,
		`    if [ -e "$backup/$name" ]; then sudo mv "$backup/$name" "$live"; else sudo rm -f "$live"; fi`,
		`  done`,
		`  echo "nginx -t failed; ${nginxSitesPath} rolled back, nginx untouched"`,
		`  sudo nginx -t`,
		`  exit 1`,
		`fi`,
	].join('\n');
}
