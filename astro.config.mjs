// @ts-check
import { satteri } from '@astrojs/markdown-satteri';
import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';
import tailwindcss from '@tailwindcss/vite';
import fontDevtools from '@xsynaptic/astro-font-devtools';
import { autoImport } from '@xsynaptic/satteri-auto-import';
import { defineConfig, fontProviders } from 'astro/config';

export default defineConfig({
	experimental: {
		contentIntellisense: true,
	},
	fonts: [
		{
			cssVariable: '--font-manrope',
			name: 'Manrope',
			provider: fontProviders.fontsource(),
			styles: ['normal'],
			weights: [400, 500, 600, 700],
		},
		{
			cssVariable: '--font-prompt',
			name: 'Prompt',
			provider: fontProviders.fontsource(),
			styles: ['normal'],
			weights: [400, 500, 600, 700],
		},
	],
	image: {
		layout: 'constrained',
		responsiveStyles: true,
	},
	integrations: [mdx(), sitemap(), fontDevtools({ providers: ['fontsource'] })],
	markdown: {
		processor: satteri({
			mdastPlugins: [
				autoImport({
					imports: [
						{
							'./src/components/embed/embed-mixcloud.astro': [['default', 'Mixcloud']],
							'./src/components/embed/embed-soundcloud.astro': [['default', 'Soundcloud']],
							'./src/components/mdx/img.astro': [['default', 'Img']],
							'./src/components/mdx/link.astro': [['default', 'Link']],
							'./src/components/mdx/more.astro': [['default', 'More']],
						},
					],
				}),
			],
		}),
	},
	site: import.meta.env.PROD ? 'https://djbasilisk.com/' : 'http://localhost:4321/',
	vite: {
		plugins: [tailwindcss()],
	},
});
