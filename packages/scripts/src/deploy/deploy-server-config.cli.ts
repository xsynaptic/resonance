#!/usr/bin/env tsx
import { parseArgs } from 'node:util';

import { loadDeployConfig } from '#deploy/deploy-config.ts';
import { deployServerConfig } from '#deploy/deploy-server-config.ts';
import { findWorkspaceRoot } from '#shared/utils.ts';

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
