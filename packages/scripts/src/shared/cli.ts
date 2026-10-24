import { parseArgs } from 'node:util';

import { findWorkspaceRoot } from '#shared/utils.ts';

export function toDryRunOptions() {
	const { values } = parseArgs({
		args: process.argv.slice(2),
		options: {
			'dry-run': { default: false, type: 'boolean' },
		},
	});

	return { dryRun: values['dry-run'], rootPath: findWorkspaceRoot() };
}
