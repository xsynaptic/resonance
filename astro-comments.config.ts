import { defineCommentsConfig } from '@xsynaptic/astro-comments/config';
import { globSync } from 'node:fs';
import path from 'node:path';

const draftThreads = globSync('packages/content/collections/{mixes,posts,reviews}/**/_*.mdx', {
	cwd: import.meta.dirname,
}).map((file) => `${file.split(path.sep)[3] ?? ''}/${path.basename(file, '.mdx').slice(1)}`);

export default defineCommentsConfig({
	d1: {
		local: { binding: 'DB', configPath: 'wrangler.jsonc' },
		remote: {
			accountId: process.env.CLOUDFLARE_ACCOUNT_ID,
			apiToken: process.env.CLOUDFLARE_DEPLOY_TOKEN,
			databaseId: process.env.CLOUDFLARE_COMMENTS_DATABASE_ID,
		},
	},
	ignoredOrphans: draftThreads,
	owners: { basilisk: [process.env.COMMENTS_OWNER_EMAIL] },
	publishEmailHash: true,
	snapshotDirectory: 'node_modules/.cache/comments',
	threadRegistry: 'dist/comment-threads.json',
});
