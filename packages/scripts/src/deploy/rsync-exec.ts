import chalk from 'chalk';
import { $ } from 'zx';

interface RsyncOptions {
	dryRun?: boolean;
	excludes?: Array<string>;
	extraFlags?: Array<string>;
}

export async function rsync(
	source: Array<string> | string,
	destination: string,
	{ dryRun = false, excludes = [], extraFlags = [] }: RsyncOptions = {},
): Promise<string> {
	const args = [
		'-av',
		'--progress',
		...excludes.map((pattern) => `--exclude=${pattern}`),
		...extraFlags,
		...(dryRun ? ['--dry-run'] : []),
		...(Array.isArray(source) ? source : [source]),
		destination,
	];

	const command = $({ stdio: ['inherit', 'pipe', 'inherit'] })`rsync ${args}`;

	command.pipe(process.stdout);

	const result = await command;

	return result.stdout;
}

// Under dry-run, print the command instead of running it so a deploy preview shows remote actions
export async function sshExec(
	remoteHost: string,
	command: string,
	{ dryRun = false }: { dryRun?: boolean } = {},
): Promise<void> {
	if (dryRun) {
		console.log(chalk.yellow(`DRY RUN ssh: ${command}`));
		return;
	}

	await $({ stdio: 'inherit' })`ssh ${remoteHost} ${command}`;
}
