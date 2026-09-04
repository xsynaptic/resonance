import { satteri } from '@astrojs/markdown-satteri';
import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';
import tailwindcss from '@tailwindcss/vite';
import buildLogger from '@xsynaptic/astro-build-logger';
import fontDevtools from '@xsynaptic/astro-font-devtools';
import { autoImport } from '@xsynaptic/satteri-auto-import';
import { imgGroupSatteriPlugin } from '@xsynaptic/satteri-img-group';
import { isIndexableUrlPath, readSitemapLastmod } from '@xsynaptic/shared/sitemap';
import pagefind from 'astro-pagefind';
import { defineConfig, envField, fontProviders } from 'astro/config';

import inventory from './src/inventory/inventory-integration.ts';
import { shikiTheme } from './src/lib/utils/shiki-theme.ts';

// One origin for the app and the deploy scripts; a mismatch misses every lastmod lookup silently
// `astro:env` is unavailable while the config evaluates, hence `process.env`
const siteUrl = process.env.DEPLOY_SITE_URL ?? 'https://djbasilisk.com/';

// Read on first use, so loading this config never depends on a file a content script writes
let sitemapLastmodCache: ReturnType<typeof readSitemapLastmod> | undefined;

function getSitemapLastmod() {
	if (!sitemapLastmodCache) sitemapLastmodCache = readSitemapLastmod();

	return sitemapLastmodCache;
}

export default defineConfig({
	// `getViteConfig` scripts run Vite in serve mode, where Astro reads the store from `.astro`
	// Pointing the cache here is what makes `astro sync` and `astro build` write the file those scripts read
	cacheDir: './.astro/',
	env: {
		schema: {
			FILES_URL: envField.string({
				access: 'public',
				context: 'server',
				default: 'https://files.djbasilisk.com/',
			}),
			// Domain the Open Graph cards are served from; unset means the site's own origin
			OG_BASE_URL: envField.string({ access: 'public', context: 'server', optional: true }),
			TURNSTILE_SITE_KEY: envField.string({ access: 'public', context: 'server', default: '' }),
			UMAMI_DOMAIN: envField.string({ access: 'public', context: 'client', optional: true }),
			UMAMI_ID: envField.string({ access: 'public', context: 'client', optional: true }),
		},
	},
	experimental: {
		contentIntellisense: true,
	},
	fonts: [
		{
			cssVariable: '--font-archivo',
			name: 'Archivo',
			provider: fontProviders.fontsource(),
			styles: ['normal', 'italic'],
			weights: ['400 700'],
		},
		{
			cssVariable: '--font-fira-sans',
			name: 'Fira Sans',
			provider: fontProviders.fontsource(),
			styles: ['normal', 'italic'],
			weights: [400, 600, 700],
		},
	],
	image: {
		layout: 'constrained',
		responsiveStyles: true,
	},
	integrations: [
		mdx(),
		sitemap({
			filter: (page) => isIndexableUrlPath(new URL(page).pathname),
			serialize: (item) => {
				const sitemapLastmod = getSitemapLastmod();

				return {
					...item,
					lastmod: sitemapLastmod.urls[item.url] ?? sitemapLastmod.generatedAt,
				};
			},
		}),
		fontDevtools({ providers: ['fontsource'] }),
		pagefind(),
		buildLogger(),
		inventory(),
	],
	markdown: {
		processor: satteri({
			mdastPlugins: [
				autoImport({
					imports: [
						{
							'./src/components/embed/embed-mixcloud.astro': [['default', 'Mixcloud']],
							'./src/components/embed/embed-soundcloud.astro': [['default', 'Soundcloud']],
							'./src/components/embed/embed-youtube.astro': [['default', 'YouTube']],
							'./src/components/mdx/img-group.astro': [['default', 'ImgGroup']],
							'./src/components/mdx/img.astro': [['default', 'Img']],
							'./src/components/mdx/link.astro': [['default', 'Link']],
							'./src/components/mdx/more.astro': [['default', 'More']],
							'./src/components/mdx/selections.astro': [['default', 'Selections']],
							'./src/components/mdx/track-list.astro': [['default', 'TrackList']],
						},
					],
				}),
				imgGroupSatteriPlugin({
					contexts: { grid: {} },
					defaultContext: 'grid',
					layouts: [],
				}),
			],
		}),
		shikiConfig: { theme: shikiTheme },
	},
	site: import.meta.env.PROD ? siteUrl : 'http://localhost:4321/',
	vite: {
		plugins: [tailwindcss()],
	},
});
