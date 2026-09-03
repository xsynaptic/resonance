import type { APIRoute } from 'astro';

import rss from '@astrojs/rss';

import { getFeedItems } from '#lib/feed/feed-items.ts';
import { t } from '#lib/i18n/i18n-strings.ts';
import { site } from '#lib/site.ts';
import { formatStringTemplate } from '#lib/utils/text.ts';

export const GET = (async (context) => {
	const siteUrl = context.site;

	if (!siteUrl) throw new Error('The RSS feed needs `site` set in the Astro config.');

	const items = await getFeedItems(siteUrl);

	// Freshness tracks the newest item rather than the build, so an unchanged feed keeps its ETag
	const lastBuildDate = items[0]?.pubDate;
	const copyright = formatStringTemplate(t('footer.copyright'), {
		year: new Date().getFullYear(),
	});

	return rss({
		customData: [
			'<language>en-us</language>',
			`<atom:link href="${new URL('rss.xml', siteUrl).href}" rel="self" type="application/rss+xml"/>`,
			...(lastBuildDate ? [`<lastBuildDate>${lastBuildDate.toUTCString()}</lastBuildDate>`] : []),
			`<copyright>${copyright}</copyright>`,
		].join(''),
		description: site.description,
		items,
		site: siteUrl,
		title: site.title,
		xmlns: { atom: 'http://www.w3.org/2005/Atom' },
	});
}) satisfies APIRoute;
