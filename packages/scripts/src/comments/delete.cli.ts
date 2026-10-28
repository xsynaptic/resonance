#!/usr/bin/env node
import { deleteComment } from '#comments/moderate.ts';
import { runCommand } from '#shared/command.ts';

await runCommand({
	name: 'comments-delete',
	options: {
		local: {
			default: false,
			description: 'Delete from the local D1 rather than the remote one',
			type: 'boolean',
		},
	},
	positional: {
		description: 'Comment id to erase, permanently',
		name: 'id',
		required: true,
	},
	async run({ positionals, rootPath, values }) {
		const [id] = positionals;

		await deleteComment(id, { isLocal: values.local, rootPath });
	},
	summary: 'Delete one comment from D1',
	title: 'Delete comment',
});
