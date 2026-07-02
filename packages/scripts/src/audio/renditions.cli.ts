#!/usr/bin/env tsx
import { parseArgs } from 'node:util';

import { findWorkspaceRoot } from '../shared/utils.js';
import { generateRenditions } from './renditions.js';

const { values } = parseArgs({
	args: process.argv.slice(2),
	options: {
		'dry-run': { default: false, type: 'boolean' },
	},
});

await generateRenditions({
	dryRun: values['dry-run'],
	rootPath: findWorkspaceRoot(),
});
