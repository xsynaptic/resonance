#!/usr/bin/env tsx
import { parseArgs } from 'node:util';

import { ensureSshKeychain, findWorkspaceRoot } from '../shared/utils.js';
import { deployAudio } from './deploy-audio.js';

const { values } = parseArgs({
	args: process.argv.slice(2),
	options: {
		'dry-run': { default: false, type: 'boolean' },
	},
});

await ensureSshKeychain();

await deployAudio({
	dryRun: values['dry-run'],
	rootPath: findWorkspaceRoot(),
});
