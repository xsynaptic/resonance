// eslint-disable-next-line @typescript-eslint/ban-ts-comment -- the @ts-nocheck below is deliberate
// @ts-nocheck -- KnipConfig is very expensive and we only need this when modifying the config
import type { KnipConfig } from 'knip';

export default {
	// Agent tooling and scratch, not project source
	ignore: ['.claude/**'],
	// knip reads `compilerOptions.types` entries as package names, not relative paths
	ignoreUnresolved: ['../worker-configuration.d.ts'],
	workspaces: {
		'.': {
			entry: [
				// MDX auto-import components; referenced via satteri-auto-import, not static imports
				'src/components/mdx/**/*.astro',
				// The inventory and the dev audio routes; injected by entrypoint string, not imported
				'src/dev/inventory/inventory.astro',
				'src/dev/inventory/inventory-og-image.ts',
				'src/dev/audio/stream-rendition.ts',
				'src/dev/audio/waveform-archive.ts',
			],
			ignoreDependencies: [
				// Types only, for `packages/content`'s MDX typings, which name React's JSX types
				'@types/react',
				// Indirect peer of `@xsynaptic/eslint-config`'s getAstroConfig({ a11y: 'strict' })
				'eslint-plugin-jsx-a11y',
			],
		},
		'packages/content': {
			// The content scripts delegate to root via `pnpm -w run`, which knip reads as a binary
			ignoreBinaries: ['check-content', 'content-schemas', 'fix-content', 'validate-content'],
			// Enables knip's MDX plugin here; there is no `astro` devDep to do it
			// `react` is the tsconfig's `jsxImportSource` for MDX typings; only the root's `@types/react` is installed
			ignoreDependencies: ['mdxlint', 'react'],
		},
		'packages/scripts': {
			ignoreBinaries: ['audiowaveform', 'ffmpeg', 'ffprobe', 'ssh-add'],
			ignoreDependencies: ['@fontsource/.+', '@types/react', 'react'],
		},
	},
} satisfies KnipConfig;
