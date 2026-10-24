#!/usr/bin/env -S node --import tsx
import chalk from 'chalk';
import { $ } from 'zx';

import { generateRedirects } from '#generate-redirects/index.ts';
import { generateLqip } from '#lqip/lqip.ts';
import { generateOpenGraphImages } from '#og-image/index.ts';
import { findWorkspaceRoot } from '#shared/utils.ts';
import { generateSitemapLastmod } from '#sitemap-lastmod/index.ts';

const rootPath = findWorkspaceRoot();
const siteUrl = process.env.DEPLOY_SITE_URL;

if (!siteUrl) {
	console.error(chalk.red('Missing site URL: set DEPLOY_SITE_URL'));
	process.exit(1);
}

const astro = $({ cwd: rootPath, preferLocal: true, stdio: 'inherit' });

await astro`astro sync`;
await generateLqip(rootPath);
await generateRedirects(rootPath);
await generateSitemapLastmod({ rootPath, siteUrl });
await astro`astro build`;
await generateOpenGraphImages({ rootPath });
