#!/usr/bin/env tsx
import { parseArgs } from 'node:util';

import { findWorkspaceRoot } from '../shared/utils.js';
import { deployApp } from './deploy-app.js';

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
