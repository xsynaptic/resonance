#!/usr/bin/env node
import { pullComments } from '#comments/pull.ts';
import { runCommand } from '#shared/command.ts';

await runCommand({
	name: 'comments-pull',
	options: {
		local: {
			default: false,
			description: 'Pull from the local D1 rather than the remote one',
			type: 'boolean',
		},
	},
	async run({ rootPath, values }) {
		await pullComments({ isLocal: values.local, rootPath });
	},
	summary: 'Write the approved comments snapshot the build reads',
	title: 'Pull comments',
});
