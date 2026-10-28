#!/usr/bin/env node
import { loadDeployConfig } from '#deploy/deploy-config.ts';
import { deployServerConfig } from '#deploy/deploy-server-config.ts';
import { runCommand } from '#shared/command.ts';

await runCommand({
	name: 'deploy-server-config',
	options: {
		'dry-run': {
			default: false,
			description: 'Stage nothing; rsync reports what it would send and ssh prints its commands',
			type: 'boolean',
		},
	},
	async run({ rootPath, values }) {
		await deployServerConfig({ config: loadDeployConfig(), dryRun: values['dry-run'], rootPath });
	},
	summary: 'Push the nginx vhosts, stats script, systemd units and tmpfiles to the file server',
	title: 'Deploy server config',
});
