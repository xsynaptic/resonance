#!/usr/bin/env -S node --import tsx
import { runChild, UserError } from '@xsynaptic/astro-scripts';

import { generateRedirects } from '#generate-redirects/index.ts';
import { generateLqip } from '#lqip/lqip.ts';
import { generateOpenGraphImages } from '#og-image/index.ts';
import { runCommand } from '#shared/command.ts';
import { generateSitemapLastmod } from '#sitemap-lastmod/index.ts';

await runCommand({
	name: 'build',
	async run({ rootPath }) {
		const siteUrl = process.env.DEPLOY_SITE_URL;

		if (!siteUrl) throw new UserError('Missing site URL: set DEPLOY_SITE_URL');

		await runChild('Syncing content', ['pnpm', 'exec', 'astro', 'sync'], { cwd: rootPath });
		await generateLqip(rootPath);
		await generateRedirects(rootPath);
		await generateSitemapLastmod({ rootPath, siteUrl });
		await runChild('Building site', ['pnpm', 'exec', 'astro', 'build'], { cwd: rootPath });
		await generateOpenGraphImages({ rootPath });
	},
	summary:
		'Sync content, derive LQIP, redirects and sitemap dates, build, then draw Open Graph cards',
	title: 'Build',
});
