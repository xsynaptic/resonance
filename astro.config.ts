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
import oneDarkPro from 'shiki/themes/one-dark-pro.mjs';

import devAudio from '#dev/audio/audio-integration.ts';
import devInventory from '#dev/inventory/inventory-integration.ts';

// One origin for the app and the deploy scripts; a mismatch misses every lastmod lookup silently
// `astro:env` is unavailable while the config evaluates, hence `process.env`
const siteUrl = process.env.DEPLOY_SITE_URL ?? 'https://djbasilisk.com/';

let sitemapLastmodCache: ReturnType<typeof readSitemapLastmod> | undefined;

function getSitemapLastmod() {
	if (!sitemapLastmodCache) sitemapLastmodCache = readSitemapLastmod();

	return sitemapLastmodCache;
}

export default defineConfig({
	cacheDir: './.astro/',
	devToolbar: { enabled: false },
	env: {
		schema: {
			FILES_URL: envField.string({
				access: 'public',
				context: 'server',
				default: 'https://files.djbasilisk.com/',
			}),
			OG_BASE_URL: envField.string({ access: 'public', context: 'server', optional: true }),
			PLAYER_ENABLED: envField.boolean({ access: 'public', context: 'server', default: false }),
			PLAYER_OVERLAY_ENABLED: envField.boolean({
				access: 'public',
				context: 'server',
				default: false,
			}),
			TURNSTILE_SITE_KEY: envField.string({ access: 'public', context: 'server' }),
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
		breakpoints: [450, 600, 900, 1200, 1800],
		layout: 'constrained',
		responsiveStyles: true,
		service: {
			config: { webp: { effort: 6, quality: 82 } },
			entrypoint: 'astro/assets/services/sharp',
		},
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
		devAudio(),
		devInventory(),
	],
	markdown: {
		processor: satteri({
			mdastPlugins: [
				autoImport({
					imports: [
						{
							'./src/components/embed/embed-mixcloud.astro': [['default', 'Mixcloud']],
							'./src/components/embed/embed-soundcloud.astro': [['default', 'Soundcloud']],
							'./src/components/mdx/embed-youtube.astro': [['default', 'YouTube']],
							'./src/components/mdx/img-group.astro': [['default', 'ImgGroup']],
							'./src/components/mdx/img.astro': [['default', 'Img']],
							'./src/components/mdx/link.astro': [['default', 'Link']],
							'./src/components/mdx/more.astro': [['default', 'More']],
							'./src/components/mdx/quotation.astro': [['default', 'Quotation']],
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
		shikiConfig: { theme: { ...oneDarkPro, bg: 'var(--color-surface-800)' } },
	},
	site: import.meta.env.PROD ? siteUrl : 'http://localhost:4321/',
	vite: {
		build: {
			assetsInlineLimit: 1024,
		},
		plugins: [tailwindcss()],
	},
});
