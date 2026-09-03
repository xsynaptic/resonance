import type { APIRoute } from 'astro';

export const GET = (({ site }) => {
	const sitemapUrl = new URL('sitemap-index.xml', site).href;

	return new Response(`User-agent: *
Disallow: /pagefind/

Sitemap: ${sitemapUrl}
`);
}) satisfies APIRoute;
