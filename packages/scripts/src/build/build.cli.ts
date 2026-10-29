#!/usr/bin/env -S node --import tsx
import { runSubprocess } from '@xsynaptic/astro-scripts';

import { generateRedirects } from '#generate-redirects/index.ts';
import { generateOpenGraphImages } from '#og-image/index.ts';
import { runCommand } from '#shared/command.ts';
import { generateSitemapLastmod } from '#sitemap-lastmod/index.ts';

await runCommand({
	name: 'build',
	async run({ rootPath, signal }) {
		await runSubprocess('Syncing content', ['pnpm', 'exec', 'astro', 'sync'], { cwd: rootPath });
		await generateRedirects(rootPath);
		await generateSitemapLastmod(rootPath);
		await runSubprocess('Building site', ['pnpm', 'exec', 'astro', 'build'], { cwd: rootPath });
		await generateOpenGraphImages({ rootPath, signal });
	},
	summary: 'Sync content, derive redirects and sitemap dates, build, then draw Open Graph cards',
	title: 'Build',
});
