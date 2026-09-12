import type { NavigationItem } from '#components/navigation/navigation-types.ts';

import { getCollectionPath } from '#lib/utils/routing.ts';

// Term list pages not in the header
export const navigationFooterItems = [
	{ title: 'Artists', url: getCollectionPath('artists') },
	{ title: 'Styles', url: getCollectionPath('styles') },
	{ title: 'Labels', url: getCollectionPath('labels') },
	{ title: 'Series', url: getCollectionPath('series') },
	{ title: 'Eras', url: getCollectionPath('eras') },
	{ title: 'Themes', url: getCollectionPath('themes') },
] satisfies Array<NavigationItem>;
