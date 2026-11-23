#!/usr/bin/env node
import { existsSync } from 'node:fs';
import { parseArgs, styleText } from 'node:util';

import type { CommentsConfig } from '#cli/define-config.ts';

import { deleteComment, moderateComments, pullComments, reportOrphans } from '#cli/commands.ts';
import { loadCommentsConfig } from '#cli/config.ts';
import { writeSchemaMigration } from '#cli/schema.ts';

const usage = `Usage: astro-comments <command> [--local] [--env-file <path>]

  moderate      Work through the pending queue; pulls if anything was approved
  delete <id>   Erase one comment; pulls if it was approved
  pull          Write the approved comments snapshot
  orphans       List threads the built registry does not hold
  schema <dir>  Write the comments table as the next migration in <dir>`;

const { positionals, values } = parseArgs({
	allowPositionals: true,
	options: {
		'env-file': { multiple: true, type: 'string' },
		local: { default: false, type: 'boolean' },
	},
});

// Before the config, which reads credentials from the environment; reversed so the last file wins, as with Node's flag
const envFiles = (values['env-file'] ?? []).toReversed();

for (const file of envFiles) {
	if (existsSync(file)) process.loadEnvFile(file);
}

const [command, argument] = positionals;
const target = values.local ? 'local' : 'remote';

const commands: Partial<Record<string, (config: CommentsConfig) => Promise<unknown>>> = {
	delete: (config) => (argument ? deleteComment(config, target, argument) : rejectMissingId()),
	moderate: (config) => moderateComments(config, target),
	orphans: (config) => reportOrphans(config, target),
	pull: (config) => pullComments(config, target),
};

function rejectMissingId(): Promise<never> {
	return Promise.reject(new Error('delete needs a comment id'));
}

try {
	await run();
} catch (error) {
	console.error(styleText('red', error instanceof Error ? error.message : String(error)));
	process.exitCode = 1;
}

async function run(): Promise<void> {
	if (command === 'schema' && argument) {
		console.log(`Wrote ${await writeSchemaMigration(argument)}`);
		return;
	}

	const handler = command === undefined ? undefined : commands[command];

	if (!handler) {
		console.log(usage);
		process.exitCode = command === undefined ? 0 : 1;
		return;
	}

	await handler(await loadCommentsConfig(process.cwd()));
}
