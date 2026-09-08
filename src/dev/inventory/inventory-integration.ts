import type { AstroIntegration } from 'astro';

import { openGraphBasePath, openGraphImageFormat } from '@xsynaptic/shared/constants';

interface InventoryOptions {
	entrypoint?: string;
	route?: string;
}

export default function devInventory({
	entrypoint = './src/dev/inventory/inventory.astro',
	route = '/inventory',
}: InventoryOptions = {}): AstroIntegration {
	return {
		hooks: {
			'astro:config:setup': ({ command, injectRoute }) => {
				if (command !== 'dev') return;

				injectRoute({ entrypoint, pattern: route });
				injectRoute({ entrypoint, pattern: `${route}/no-hero` });

				injectRoute({
					entrypoint: './src/dev/inventory/og-card.ts',
					pattern: `/${openGraphBasePath}/[id].${openGraphImageFormat}`,
				});
			},
		},
		name: 'dev-inventory',
	};
}
