import type { KnipConfig } from 'knip';

export default {
	// Read by the content loader through `CONTENT_DATA_PATH`, never imported
	ignoreFiles: ['packages/content-demo/**'],
	// knip reads `compilerOptions.types` entries as package names, not relative paths
	ignoreUnresolved: ['../worker-configuration.d.ts'],
	workspaces: {
		'.': {
			entry: [
				// MDX auto-import components; referenced via satteri-auto-import, not static imports
				'src/components/mdx/**/*.astro',
				// The inventory and the dev audio routes; injected by entrypoint string, not imported
				'src/dev/inventory/inventory-page-*.astro',
				'src/dev/inventory/inventory-og-image.ts',
				'src/dev/audio/stream-rendition.ts',
				'src/dev/audio/waveform-archive.ts',
			],
			ignoreDependencies: [
				// Loaded by `astro check` in `lefthook.yml`, which knip does not trace to the package
				'@astrojs/check',
				// Indirect peer of `@xsynaptic/eslint-config`'s getAstroConfig({ a11y: 'strict' })
				'eslint-plugin-jsx-a11y',
			],
		},
		'packages/content': {
			// The content scripts delegate to root via `pnpm -w run`, which knip reads as a binary
			ignoreBinaries: ['check-content', 'content-schemas', 'fix-content', 'validate-content'],
			// Enables knip's MDX plugin here; there is no `astro` devDep to do it
			// `react` is the tsconfig's `jsxImportSource` for MDX typings; only `@types/react` is installed
			ignoreDependencies: ['mdxlint', 'react'],
		},
		'packages/player': {
			entry: ['e2e/page/host.ts'],
		},
		'packages/scripts': {
			ignoreBinaries: ['ffmpeg', 'ssh-add'],
			ignoreDependencies: ['@fontsource/.+', '@types/react', 'react'],
		},
	},
} satisfies KnipConfig;
