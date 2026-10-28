import { log, runChild } from '@xsynaptic/astro-scripts';
import { $ } from 'zx';

interface RsyncOptions {
	archive?: 'av' | 'avz';
	config: SshTarget;
	describe?: (stdout: string) => string;
	dryRun?: boolean;
	excludes?: Array<string>;
	extraFlags?: Array<string>;
	quiet?: boolean;
}

interface RsyncRunOptions extends RsyncOptions {
	label: string;
}

interface SshTarget {
	remoteHost: string;
	sshKeyPath?: string;
}

export function buildRsyncArgs(
	source: Array<string> | string,
	destination: string,
	options: RsyncOptions,
): Array<string> {
	const { config, dryRun = false, excludes = [], extraFlags = [] } = options;

	return [
		...getArchiveFlags(options),
		...(config.sshKeyPath ? ['-e', `ssh -i ${config.sshKeyPath}`] : []),
		...excludes.map((pattern) => `--exclude=${pattern}`),
		...extraFlags,
		...(dryRun ? ['--dry-run'] : []),
		...(Array.isArray(source) ? source : [source]),
		destination,
	];
}

export async function rsyncTo(
	source: Array<string> | string,
	destination: string,
	options: RsyncRunOptions,
): Promise<string> {
	const { describe, label } = options;
	const stdout: Array<string> = [];

	await runChild(label, ['rsync', ...buildRsyncArgs(source, destination, options)], {
		...(describe ? { describe: () => describe(stdout.join('\n')) } : {}),
		onLine: (line, stream) => {
			if (stream === 'stdout') stdout.push(line);

			return true;
		},
	});

	return stdout.join('\n');
}

// For dry-run, print the command instead of running it so a deploy preview shows remote actions
export async function sshExec(
	config: SshTarget,
	command: string,
	{ dryRun = false }: { dryRun?: boolean } = {},
): Promise<void> {
	if (dryRun) {
		log.warn('Dry run ssh:');
		log.detail(command);
		return;
	}

	const sshArgs = [...(config.sshKeyPath ? ['-i', config.sshKeyPath] : []), config.remoteHost];

	await $({ stdio: 'inherit' })`ssh ${sshArgs} ${command}`;
}

// Callers that parse the returned file list need `-v`; a quiet pull prints nothing on success
function getArchiveFlags({ archive = 'avz', quiet = false }: RsyncOptions) {
	return quiet ? [`-${archive.replace('v', '')}`] : [`-${archive}`, '--progress'];
}
