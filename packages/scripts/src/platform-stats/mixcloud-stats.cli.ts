#!/usr/bin/env tsx
import { parseArgs } from 'node:util';

import { pullMixcloudStats } from '#platform-stats/mixcloud-stats.ts';
import { findWorkspaceRoot } from '#shared/utils.ts';

const { values } = parseArgs({
	args: process.argv.slice(2),
	options: {
		'dry-run': { default: false, type: 'boolean' },
		force: { default: false, type: 'boolean' },
	},
});

await pullMixcloudStats({
	dryRun: values['dry-run'],
	force: values.force,
	rootPath: findWorkspaceRoot(),
});
