import type { NavigationItem } from '#components/navigation/navigation-types.ts';

import { identityLinks } from '#lib/site.ts';

export const navigationFooterItems = identityLinks.map((link) => ({
	rel: 'me',
	title: link.title,
	url: link.url,
})) satisfies Array<NavigationItem>;
