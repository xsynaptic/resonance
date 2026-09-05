#!/usr/bin/env tsx
import chalk from 'chalk';
import { parseArgs } from 'node:util';

import { deleteComment, moderateComments } from '#comments/moderate.ts';
import { reportOrphans } from '#comments/orphans.ts';
import { findWorkspaceRoot } from '#shared/utils.ts';

const usage = `
  ${chalk.bold('pnpm comments')}                  moderate the pending queue
  ${chalk.bold('pnpm comments orphans')}          list comments whose entry no longer exists
  ${chalk.bold('pnpm comments delete <id>')}      erase one comment, permanently

  ${chalk.dim('--local')}                        act on the local D1 rather than the remote one
`;

const { positionals, values } = parseArgs({
	allowPositionals: true,
	args: process.argv.slice(2),
	options: { local: { default: false, type: 'boolean' } },
});

const [command, argument] = positionals;

const options = { isLocal: values.local, rootPath: findWorkspaceRoot() };

switch (command) {
	case 'delete': {
		if (argument === undefined) {
			console.log(chalk.red('\n  `delete` needs a comment id.'));
			console.log(usage);
			process.exitCode = 1;
		} else {
			await deleteComment(argument, options);
		}

		break;
	}
	case 'orphans': {
		await reportOrphans(options);

		break;
	}
	case undefined: {
		await moderateComments(options);

		break;
	}
	default: {
		console.log(chalk.red(`\n  Unknown command: ${command}`));
		console.log(usage);
		process.exitCode = 1;
	}
}
