#!/usr/bin/env tsx
import { parseArgs } from 'node:util';

import { findWorkspaceRoot } from '../shared/utils.js';
import { generateOpenGraphImages } from './og-image.js';

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
