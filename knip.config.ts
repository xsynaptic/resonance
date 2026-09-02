// eslint-disable-next-line @typescript-eslint/ban-ts-comment -- the @ts-nocheck below is deliberate
// @ts-nocheck -- KnipConfig is very expensive and we only need this when modifying the config
import type { KnipConfig } from 'knip';

export default {
	workspaces: {
		'.': {
			entry: [
				// MDX auto-import components; referenced via satteri-auto-import, not static imports
				'src/components/mdx/**/*.astro',
				// The inventory; injected by entrypoint string in the integration, not imported
				'src/inventory/inventory.astro',
			],
			ignoreDependencies: [
				// Indirect peer of `@xsynaptic/eslint-config`'s getAstroConfig({ a11y: 'strict' })
				'eslint-plugin-jsx-a11y',
				// Used via wrangler.jsonc and the deploy script, neither traceable
				'wrangler',
			],
		},
		'packages/content': {
			// The content scripts delegate to root via `pnpm -w run`, which knip reads as a binary
			ignoreBinaries: ['check-content', 'fix-content', 'validate-content'],
			ignoreDependencies: [
				'mdxlint', // enables knip's MDX plugin here; there is no `astro` devDep to do it
				'react', // type-only: jsxImportSource in tsconfig, React.JSX in the MDX ambient types
			],
		},
		'packages/scripts': {
			ignoreBinaries: ['audiowaveform', 'ffmpeg', 'ffprobe', 'ssh-add'],
			ignoreDependencies: ['mysql2', '@fontsource/.+', '@types/react', 'react'],
		},
	},
} satisfies KnipConfig;
