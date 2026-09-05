#!/usr/bin/env tsx
import { parseArgs } from 'node:util';

import { generateRenditions } from '#audio/renditions.ts';
import { findWorkspaceRoot } from '#shared/utils.ts';

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
