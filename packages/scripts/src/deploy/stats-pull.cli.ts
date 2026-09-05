#!/usr/bin/env tsx
import { parseArgs } from 'node:util';

import { loadDeployConfig } from '#deploy/deploy-config.ts';
import { pullStats } from '#deploy/stats-pull.ts';
import { findWorkspaceRoot } from '#shared/utils.ts';

const { values } = parseArgs({
	args: process.argv.slice(2),
	options: {
		'dry-run': { default: false, type: 'boolean' },
	},
});

await pullStats({
	config: loadDeployConfig(),
	dryRun: values['dry-run'],
	rootPath: findWorkspaceRoot(),
});
