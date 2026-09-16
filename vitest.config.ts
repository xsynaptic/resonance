import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// `deploy-site` exports NODE_ENV=production, which flips `import.meta.env.DEV`; pinned so the gate cannot depend on its caller
process.env.NODE_ENV = 'test';

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
		env: { SITE: 'http://localhost:4321/' },
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
						'packages/playback-stats/**',
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
			{
				extends: true,
				test: {
					environment: 'happy-dom',
					include: ['packages/playback-stats/**/*.test.ts'],
					name: 'playback-stats',
				},
			},
		],
		silent: 'passed-only',
	},
});
