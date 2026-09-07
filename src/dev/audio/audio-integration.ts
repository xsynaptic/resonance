import type { AstroIntegration } from 'astro';

// Injected only under `astro dev`, so dev serves both files from disk instead of the production box
export default function devAudio(): AstroIntegration {
	return {
		hooks: {
			'astro:config:setup': ({ command, injectRoute }) => {
				if (command !== 'dev') return;

				injectRoute({
					entrypoint: './src/dev/audio/stream-rendition.ts',
					pattern: '/stream/[file]',
				});
				injectRoute({
					entrypoint: './src/dev/audio/waveform-archive.ts',
					pattern: '/waveform/[file]',
				});
			},
		},
		name: 'dev-audio',
	};
}
