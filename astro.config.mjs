// @ts-check
import { satteri } from '@astrojs/markdown-satteri';
import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';
import tailwindcss from '@tailwindcss/vite';
import fontDevtools from '@xsynaptic/astro-font-devtools';
import { autoImport } from '@xsynaptic/satteri-auto-import';
import { imgGroupSatteriPlugin } from '@xsynaptic/satteri-img-group';
import pagefind from 'astro-pagefind';
import { defineConfig, envField, fontProviders } from 'astro/config';

export default defineConfig({
	env: {
		schema: {
			// Root of the audio file server; the default keeps a fresh clone building without a .env
			FILES_URL: envField.string({
				access: 'public',
				context: 'server',
				default: 'https://files.djbasilisk.com/',
			}),
			// Domain the Open Graph cards are served from; unset means the site's own origin
			OG_BASE_URL: envField.string({ access: 'public', context: 'server', optional: true }),
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
			weights: [400, 500, 700],
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
	integrations: [mdx(), sitemap(), fontDevtools({ providers: ['fontsource'] }), pagefind()],
	markdown: {
		processor: satteri({
			mdastPlugins: [
				autoImport({
					imports: [
						{
							'./src/components/embed/embed-mixcloud.astro': [['default', 'Mixcloud']],
							'./src/components/embed/embed-soundcloud.astro': [['default', 'Soundcloud']],
							'./src/components/mdx/img-group.astro': [['default', 'ImgGroup']],
							'./src/components/mdx/img.astro': [['default', 'Img']],
							'./src/components/mdx/link.astro': [['default', 'Link']],
							'./src/components/mdx/list.astro': [['default', 'List']],
							'./src/components/mdx/more.astro': [['default', 'More']],
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
	},
	site: import.meta.env.PROD ? 'https://djbasilisk.com/' : 'http://localhost:4321/',
	vite: {
		plugins: [tailwindcss()],
	},
});
