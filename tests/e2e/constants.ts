import path from 'node:path';

export const localPort = 47_322;
export const localUrl = `http://localhost:${String(localPort)}`;

export const isProd = process.env.TEST_ENV === 'prod';

// Must match `DEPLOY_SITE_URL` in `.env`, which the deploy config reads as its site URL
const prodUrl = 'https://djbasilisk.com';

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

export function getBaseUrl(): string {
	return isProd ? (process.env.PROD_SERVER_URL ?? prodUrl) : localUrl;
}
