#!/usr/bin/env tsx
import { parseArgs } from 'node:util';

import { ensureSshKeychain, findWorkspaceRoot } from '../shared/utils.js';
import { deployServerConfig } from './deploy-server-config.js';

const { values } = parseArgs({
	args: process.argv.slice(2),
	options: {
		'dry-run': { default: false, type: 'boolean' },
	},
});

await ensureSshKeychain();

await deployServerConfig({
	dryRun: values['dry-run'],
	rootPath: findWorkspaceRoot(),
});
