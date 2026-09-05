import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
	resolve: {
		alias: {
			// `astro:content` resolves only inside an Astro build; tests seed the stub through `setCollections`
			'astro:content': fileURLToPath(
				new URL('src/lib/collections/astro-content-stub.ts', import.meta.url),
			),
		},
	},
	test: {
		projects: [
			{
				extends: true,
				test: {
					// Vitest 4 replaces `defaultExclude` rather than merging, so `node_modules` and `.git` must be restated here
					exclude: ['**/node_modules/**', '**/.git/**', 'dist/**', 'packages/player/**'],
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
