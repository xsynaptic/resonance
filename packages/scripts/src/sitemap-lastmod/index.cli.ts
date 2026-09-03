#!/usr/bin/env tsx
import { sitemapLastmodPath } from '@xsynaptic/shared/constants';
import chalk from 'chalk';
import { parseArgs } from 'node:util';

import { findWorkspaceRoot } from '../shared/utils.js';
import { generateSitemapLastmod } from './index.js';

const { values } = parseArgs({
	args: process.argv.slice(2),
	options: {
		'content-path': { default: 'packages/content', type: 'string' },
		'output-path': { default: sitemapLastmodPath, type: 'string' },
		'site-url': { type: 'string' },
	},
});

const siteUrl = values['site-url'] ?? process.env.DEPLOY_SITE_URL;

if (!siteUrl) {
	console.error(chalk.red('Missing site URL: pass --site-url or set DEPLOY_SITE_URL'));
	process.exit(1);
}

await generateSitemapLastmod({
	contentPath: values['content-path'],
	outputPath: values['output-path'],
	rootPath: findWorkspaceRoot(),
	siteUrl,
});
