import type { AstroIntegration } from 'astro';

import {
	openGraphBasePath,
	openGraphImageFormat,
	openGraphOutputPath,
} from '@xsynaptic/shared/constants';
import { createReadStream, existsSync } from 'node:fs';
import path from 'node:path';

interface InventoryOptions {
	entrypoint?: string;
	route?: string;
}

const openGraphFilePattern = new RegExp(String.raw`^/[\w-]+\.${openGraphImageFormat}$`);

export default function inventory({
	entrypoint = './src/inventory/inventory.astro',
	route = '/inventory',
}: InventoryOptions = {}): AstroIntegration {
	return {
		hooks: {
			'astro:config:setup': ({ command, injectRoute }) => {
				if (command !== 'dev') return;

				injectRoute({ entrypoint, pattern: route });
				injectRoute({ entrypoint, pattern: `${route}/no-hero` });
			},
			// Cards reach dist/ only through deploy-site, so under dev they are served from the cache
			'astro:server:setup': ({ server }) => {
				server.middlewares.use(`/${openGraphBasePath}`, (request, response, next) => {
					if (!request.url || !openGraphFilePattern.test(request.url)) {
						next();
						return;
					}

					const filePath = path.resolve(openGraphOutputPath, request.url.slice(1));

					if (!existsSync(filePath)) {
						next();
						return;
					}

					response.setHeader('Content-Type', 'image/jpeg');
					createReadStream(filePath).pipe(response);
				});
			},
		},
		name: 'inventory',
	};
}
