#!/usr/bin/env tsx
import { parseArgs } from 'node:util';

import { findWorkspaceRoot } from '../shared/utils.js';
import { loadDeployConfig } from './deploy-config.js';
import { pullStats } from './stats-pull.js';

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
