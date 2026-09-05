#!/usr/bin/env tsx
import { parseArgs } from 'node:util';

import { deployApp } from '#deploy/deploy-app.ts';
import { findWorkspaceRoot } from '#shared/utils.ts';

const { values } = parseArgs({
	args: process.argv.slice(2),
	options: {
		'dry-run': { default: false, type: 'boolean' },
	},
});

await deployApp({
	dryRun: values['dry-run'],
	rootPath: findWorkspaceRoot(),
});
