// eslint-disable-next-line @typescript-eslint/ban-ts-comment -- the @ts-nocheck below is deliberate
// @ts-nocheck -- KnipConfig is very expensive and we only need this when modifying the config
import type { KnipConfig } from 'knip';

export default {
	workspaces: {
		'.': {
			// MDX auto-import components; referenced via satteri-auto-import, not static imports
			entry: ['src/components/mdx/**/*.astro'],
			// Used via wrangler.jsonc and the deploy script, neither traceable
			ignoreDependencies: ['wrangler'],
		},
		'packages/content': {
			// The content scripts delegate to root via `pnpm -w run`, which knip reads as a binary
			ignoreBinaries: ['check-content', 'fix-content'],
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
