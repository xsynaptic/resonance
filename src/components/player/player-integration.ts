import type { AstroIntegration } from 'astro';

declare module 'astro' {
	interface AstroClientDirectives {
		// The player stylesheet's URL, loaded before the island hydrates
		'client:player'?: string;
	}
}

export default function player(): AstroIntegration {
	return {
		hooks: {
			'astro:config:setup': ({ addClientDirective }) => {
				addClientDirective({
					entrypoint: './src/components/player/player-directive.ts',
					name: 'player',
				});
			},
		},
		name: 'player',
	};
}
