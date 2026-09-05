#!/usr/bin/env tsx
import { parseArgs } from 'node:util';

import { generateWaveforms } from '#audio/waveforms.ts';
import { findWorkspaceRoot } from '#shared/utils.ts';

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
