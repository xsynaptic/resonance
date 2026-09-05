#!/usr/bin/env tsx
import { parseArgs } from 'node:util';

import { generateAudioManifest } from '#audio/manifest.ts';
import { findWorkspaceRoot } from '#shared/utils.ts';

const { values } = parseArgs({
	args: process.argv.slice(2),
	options: {
		'dry-run': { default: false, type: 'boolean' },
	},
});

await generateAudioManifest({
	dryRun: values['dry-run'],
	rootPath: findWorkspaceRoot(),
});
