import { log, withStep } from '@xsynaptic/astro-scripts';
import path from 'node:path';

import type { DeployConfig } from '#deploy/deploy-config.ts';

import { rsyncTo, sshExec } from '#deploy/rsync-exec.ts';
import { ensureSshKeychain } from '#shared/utils.ts';

interface DeployServerConfigOptions {
	config: DeployConfig;
	dryRun?: boolean;
	rootPath: string;
}

// Staging prunes, or a vhost renamed here is pushed live again from the copy left behind
// The apply never --delete, since other sites share the live directory with us
export async function deployServerConfig(options: DeployServerConfigOptions): Promise<void> {
	const { config, dryRun = false, rootPath } = options;

	await ensureSshKeychain();

	const deployDir = path.join(rootPath, 'deploy');
	const { fileServerConfigPath, remoteHost, stagingPath } = config;

	await withStep('Deploying server config', async () => {
		log.detail(
			[
				`nginx: ${deployDir}/nginx/sites-enabled/ -> ${remoteHost}:${fileServerConfigPath}/`,
				`stats: ${deployDir}/stats/ -> ${remoteHost}:/usr/local/bin/`,
				`units: ${deployDir}/systemd/ -> ${remoteHost}:/etc/systemd/system/`,
				`tmpfiles: ${deployDir}/tmpfiles/ -> ${remoteHost}:/etc/tmpfiles.d/`,
			].join('\n'),
		);

		if (dryRun) log.warn('Dry run');

		// The vhosts are gitignored, so this directory is local-only and absent from a fresh clone
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
		await rsyncTo(`${deployDir}/tmpfiles/`, `${remoteHost}:${stagingPath}/tmpfiles/`, {
			archive: 'av',
			config,
			dryRun,
		});

		await sshExec(config, applyNginxSites(config), { dryRun });

		// Separate from nginx so a failure in one does not strand the other half-applied
		// `daemon-reload` picks up unit edits; the timer is enabled once by hand on first provision
		await sshExec(
			config,
			[
				`sudo rsync -av --chown=root:root ${stagingPath}/stats/download-stats.py /usr/local/bin/download-stats.py`,
				`sudo rsync -av --chown=root:root ${stagingPath}/systemd/ /etc/systemd/system/`,
				`sudo rsync -av --chown=root:root ${stagingPath}/tmpfiles/ /etc/tmpfiles.d/`,
				`sudo systemctl daemon-reload`,
			].join(' && '),
			{ dryRun },
		);
	});
}

function applyNginxSites(config: DeployConfig): string {
	const { fileServerConfigOwner, fileServerConfigPath, stagingPath } = config;
	const stagedPath = `${stagingPath}/nginx/sites-enabled`;

	return [
		`set -e`,
		`backup=$(mktemp -d)`,
		`for staged in ${stagedPath}/*; do`,
		`  name=$(basename "$staged")`,
		`  live="${fileServerConfigPath}/$name"`,
		`  if [ -e "$live" ]; then sudo cp -a "$live" "$backup/$name"; fi`,
		`done`,
		`sudo rsync -av --chown=${fileServerConfigOwner} ${stagedPath}/ ${fileServerConfigPath}/`,
		`if sudo nginx -t; then`,
		`  sudo systemctl reload nginx`,
		`  sudo rm -rf "$backup"`,
		`else`,
		`  for staged in ${stagedPath}/*; do`,
		`    name=$(basename "$staged")`,
		`    live="${fileServerConfigPath}/$name"`,
		`    if [ -e "$backup/$name" ]; then sudo mv "$backup/$name" "$live"; else sudo rm -f "$live"; fi`,
		`  done`,
		`  echo "nginx -t failed; ${fileServerConfigPath} rolled back, nginx untouched"`,
		`  sudo nginx -t`,
		`  exit 1`,
		`fi`,
	].join('\n');
}
