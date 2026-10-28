#!/usr/bin/env node
import { reportOrphans } from '#comments/orphans.ts';
import { runCommand } from '#shared/command.ts';

await runCommand({
	name: 'comments-orphans',
	options: {
		local: {
			default: false,
			description: 'Read the local D1 rather than the remote one',
			type: 'boolean',
		},
	},
	async run({ rootPath, values }) {
		await reportOrphans({ isLocal: values.local, rootPath });
	},
	summary: 'List comments whose entry no longer exists',
	title: 'Orphaned comments',
});
