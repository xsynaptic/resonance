#!/usr/bin/env tsx
import { parseArgs } from 'node:util';

import { findWorkspaceRoot } from '../shared/utils.js';
import { pullMixcloudStats } from './mixcloud-stats.js';

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
