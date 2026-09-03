#!/usr/bin/env tsx
import { parseArgs } from 'node:util';

import { findWorkspaceRoot } from '../shared/utils.js';
import { loadDeployConfig } from './deploy-config.js';
import { deployServerConfig } from './deploy-server-config.js';

const { values } = parseArgs({
	args: process.argv.slice(2),
	options: {
		'dry-run': { default: false, type: 'boolean' },
	},
});

await deployServerConfig({
	config: loadDeployConfig(),
	dryRun: values['dry-run'],
	rootPath: findWorkspaceRoot(),
});
