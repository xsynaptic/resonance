import type { APIRoute } from 'astro';

import { getRssResponse } from '@xsynaptic/astro-syndication/rss';

import { getFeedItems } from '#lib/feed/feed-items.ts';
import { t } from '#lib/i18n/i18n-strings.ts';
import { site } from '#lib/site.ts';
import { formatStringTemplate } from '#lib/utils/text.ts';

export const GET = (async (context) => {
	const siteUrl = context.site;

	if (!siteUrl) throw new Error('The RSS feed needs `site` set in the Astro config.');

	const copyright = formatStringTemplate(t('footer.copyright'), {
		year: new Date().getFullYear(),
	});

	return getRssResponse({
		items: await getFeedItems(siteUrl),
		publication: {
			copyright,
			description: site.description,
			language: 'en-us',
			site: siteUrl,
			title: site.title,
		},
		selfUrl: new URL('rss.xml', siteUrl),
	});
}) satisfies APIRoute;
