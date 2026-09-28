import type { AstroIntegration } from 'astro';

import { inventoryPages, inventoryRoute } from '#dev/inventory/inventory-pages.ts';

export default function devInventory(): AstroIntegration {
	return {
		hooks: {
			'astro:config:setup': ({ command, injectRoute }) => {
				if (command !== 'dev') return;

				for (const page of inventoryPages) {
					injectRoute({
						entrypoint: `./src/dev/inventory/${page.entrypoint}`,
						pattern: `${inventoryRoute}${page.path}`,
					});
				}

				injectRoute({
					entrypoint: './src/dev/inventory/inventory-og-image.ts',
					pattern: `${inventoryRoute}/og/[key].jpg`,
				});
			},
		},
		name: 'dev-inventory',
	};
}
