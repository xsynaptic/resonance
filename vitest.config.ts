import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// `deploy-site` exports NODE_ENV=production, which flips `import.meta.env.DEV`; pinned so the gate cannot depend on its caller
// eslint-disable-next-line unicorn/no-top-level-side-effects -- has to land before Vite resolves the config
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
		environmentOptions: { happyDOM: { settings: { enableCSSFileLoading: true } } },
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
						'verify/**',
						'packages/playback-stats/**',
						'packages/plazmoid-core/**',
						'packages/plazmoid-player/**',
						'packages/plazmoid-wavedata/**',
					],
					name: 'site',
				},
			},
			{
				extends: true,
				test: {
					environment: 'happy-dom',
					include: ['packages/plazmoid-core/**/*.test.ts'],
					name: 'plazmoid-core',
				},
			},
			{
				extends: true,
				test: {
					environment: 'happy-dom',
					include: ['packages/plazmoid-player/**/*.test.ts'],
					name: 'plazmoid-player',
				},
			},
			{
				extends: true,
				test: {
					include: ['packages/plazmoid-wavedata/**/*.test.ts'],
					name: 'plazmoid-wavedata',
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
