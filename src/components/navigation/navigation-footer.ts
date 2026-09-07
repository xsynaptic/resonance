import type { NavigationItem } from '#components/navigation/navigation-types.ts';

import { getCollectionUrl } from '#lib/utils/routing.ts';

// Term list pages not in the header
export const navigationFooterItems = [
	{ title: 'Artists', url: getCollectionUrl('artists') },
	{ title: 'Styles', url: getCollectionUrl('styles') },
	{ title: 'Labels', url: getCollectionUrl('labels') },
	{ title: 'Series', url: getCollectionUrl('series') },
	{ title: 'Eras', url: getCollectionUrl('eras') },
	{ title: 'Formats', url: getCollectionUrl('formats') },
	{ title: 'Themes', url: getCollectionUrl('themes') },
] satisfies Array<NavigationItem>;
