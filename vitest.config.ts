import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
	resolve: {
		alias: {
			// `astro:content` resolves only inside an Astro build; tests seed the stub through `setCollections`
			'astro:content': fileURLToPath(
				new URL('src/lib/collections/astro-content-stub.ts', import.meta.url),
			),
			'astro:env/server': fileURLToPath(new URL('src/lib/astro-env-stub.ts', import.meta.url)),
		},
	},
	test: {
		// Vitest defaults this only when unset; an inherited `production` loads React without `React.act`
		env: { NODE_ENV: 'test', SITE: 'http://localhost:4321/' },
		projects: [
			{
				extends: true,
				test: {
					// Vitest 4 replaces `defaultExclude` rather than merging, so `node_modules` and `.git` must be restated here
					exclude: [
						'**/node_modules/**',
						'**/.git/**',
						'.claude/worktrees/**',
						'dist/**',
						'packages/player/**',
					],
					name: 'site',
				},
			},
			{
				extends: true,
				test: {
					environment: 'happy-dom',
					include: ['packages/player/**/*.test.{ts,tsx}'],
					name: 'player',
				},
			},
		],
		silent: 'passed-only',
	},
});
