import type { AstroIntegration } from 'astro';

// Injected only under `astro dev`: the archives are gitignored, and where they get served from in production is still open
export default function waveformArchive(): AstroIntegration {
	return {
		hooks: {
			'astro:config:setup': ({ command, injectRoute }) => {
				if (command !== 'dev') return;

				injectRoute({
					entrypoint: './src/dev/waveform-archive.ts',
					pattern: '/waveform/[slug].dat',
				});
			},
		},
		name: 'waveform-archive',
	};
}
