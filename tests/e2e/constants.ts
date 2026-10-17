import { readFileSync } from 'node:fs';
import path from 'node:path';

export const localPort = 47_322;
export const localUrl = `http://localhost:${String(localPort)}`;

export const isDev = process.env.TEST_ENV === 'dev';
export const isProd = process.env.TEST_ENV === 'prod';

// Must match the site URL fallback in astro.config.ts
export const prodUrl = 'https://djbasilisk.com/';

export const audioFixturePath = path.join(
	import.meta.dirname,
	'../../packages/player/e2e/.fixtures/long.mp4',
);

export const streamUrlPattern = 'https://files.djbasilisk.com/stream/*';
export const listenUrlPattern = '**/api/listen';

export const contentManifestPath = '/content-manifest.json';
export const feedPath = '/rss.xml';

export const routes = {
	archiveIndex: '/archive/',
	mixesIndex: '/mixes/',
	mixesIndexPage2: '/mixes/2/',
	postsIndex: '/posts/',
} as const;

function readDevServerUrl(): string {
	const { url } = JSON.parse(readFileSync('.astro/dev.json', 'utf8')) as { url: string };

	return url;
}

export function getBaseUrl(): string {
	if (isProd) return process.env.PROD_SERVER_URL ?? prodUrl;
	if (isDev) return readDevServerUrl();

	return localUrl;
}
