#!/usr/bin/env node
import { moderateComments } from '#comments/moderate.ts';
import { runCommand } from '#shared/command.ts';

await runCommand({
	name: 'comments',
	options: {
		local: {
			default: false,
			description: 'Moderate the local D1 rather than the remote one',
			type: 'boolean',
		},
	},
	async run({ rootPath, values }) {
		await moderateComments({ isLocal: values.local, rootPath });
	},
	summary: 'Moderate pending comments in D1',
	title: 'Comments',
});
