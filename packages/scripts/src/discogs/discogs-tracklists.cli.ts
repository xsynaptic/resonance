#!/usr/bin/env tsx
import { parseArgs } from 'node:util';

import { writeDiscogsTracklists } from '#discogs/discogs-tracklists.ts';
import { findWorkspaceRoot } from '#shared/utils.ts';

const { values } = parseArgs({
	args: process.argv.slice(2),
	options: {
		'dry-run': { default: false, type: 'boolean' },
	},
});

await writeDiscogsTracklists(findWorkspaceRoot(), values['dry-run']);
