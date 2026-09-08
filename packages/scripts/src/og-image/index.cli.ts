#!/usr/bin/env tsx
import { parseArgs } from 'node:util';

import { generateOpenGraphImages } from '#og-image/index.ts';
import { findWorkspaceRoot } from '#shared/utils.ts';

const { values } = parseArgs({
	args: process.argv.slice(2),
	options: {
		'clear-cache': { default: false, type: 'boolean' },
	},
});

await generateOpenGraphImages({
	clearCache: values['clear-cache'],
	rootPath: findWorkspaceRoot(),
});
