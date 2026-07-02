import chalk from 'chalk';
import { $ } from 'zx';

import type { DeployConfig } from './deploy-config.js';

interface RsyncOptions {
	archive?: 'av' | 'avz';
	config: DeployConfig;
	dryRun?: boolean;
	excludes?: Array<string>;
	extraFlags?: Array<string>;
}

export async function rsyncTo(
	source: Array<string> | string,
	destination: string,
	options: RsyncOptions,
): Promise<void> {
	await $({ stdio: 'inherit' })`rsync ${buildRsyncArgs(source, destination, options)}`;
}

// Under dry-run, print the command instead of running it so a deploy preview shows remote actions
export async function sshExec(
	config: DeployConfig,
	command: string,
	{ dryRun = false }: { dryRun?: boolean } = {},
): Promise<void> {
	if (dryRun) {
		console.log(chalk.yellow(`DRY RUN ssh: ${command}`));
		return;
	}

	const sshArgs = [...(config.sshKeyPath ? ['-i', config.sshKeyPath] : []), config.remoteHost];

	await $({ stdio: 'inherit' })`ssh ${sshArgs} ${command}`;
}

function buildRsyncArgs(
	source: Array<string> | string,
	destination: string,
	{ archive = 'avz', config, dryRun = false, excludes = [], extraFlags = [] }: RsyncOptions,
): Array<string> {
	return [
		`-${archive}`,
		'--progress',
		...(config.sshKeyPath ? ['-e', `ssh -i ${config.sshKeyPath}`] : []),
		...excludes.map((pattern) => `--exclude=${pattern}`),
		...extraFlags,
		...(dryRun ? ['--dry-run'] : []),
		...(Array.isArray(source) ? source : [source]),
		destination,
	];
}
