import { defineCommentsConfig } from '@xsynaptic/astro-comments/config';

export default defineCommentsConfig({
	d1: {
		local: { binding: 'DB', configPath: 'wrangler.jsonc' },
		remote: {
			accountId: process.env.CLOUDFLARE_ACCOUNT_ID,
			apiToken: process.env.CLOUDFLARE_DEPLOY_TOKEN,
			databaseId: process.env.CLOUDFLARE_COMMENTS_DATABASE_ID,
		},
	},
	ownerEmails: [process.env.COMMENTS_OWNER_EMAIL],
	snapshotDirectory: 'node_modules/.cache/comments',
	threadRegistry: 'dist/comment-threads.json',
});
