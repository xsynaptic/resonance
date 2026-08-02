#!/usr/bin/env tsx
import { parseArgs } from 'node:util';

import { findWorkspaceRoot } from '../shared/utils.js';
import { generateWaveforms } from './waveforms.js';

const { values } = parseArgs({
	args: process.argv.slice(2),
	options: {
		'dry-run': { default: false, type: 'boolean' },
	},
});

await generateWaveforms({
	dryRun: values['dry-run'],
	rootPath: findWorkspaceRoot(),
});
