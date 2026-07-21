#!/usr/bin/env tsx
import { parseArgs } from 'node:util';

import { ensureSshKeychain, findWorkspaceRoot } from '../shared/utils.js';
import { pullStats } from './stats-pull.js';

const { values } = parseArgs({
	args: process.argv.slice(2),
	options: {
		'dry-run': { default: false, type: 'boolean' },
	},
});

await ensureSshKeychain();

await pullStats({
	dryRun: values['dry-run'],
	rootPath: findWorkspaceRoot(),
});
