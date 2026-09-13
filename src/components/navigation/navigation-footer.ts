import { getCollectionPath } from '@xsynaptic/shared/routing';

import type { NavigationItem } from '#components/navigation/navigation-types.ts';

import { getArchivePath } from '#lib/collections/archive/archive-data.ts';

// Term list pages not in the header, plus the year archive beside the era axis
export const navigationFooterItems = [
	{ title: 'Artists', url: getCollectionPath('artists') },
	{ title: 'Styles', url: getCollectionPath('styles') },
	{ title: 'Labels', url: getCollectionPath('labels') },
	{ title: 'Series', url: getCollectionPath('series') },
	{ title: 'Eras', url: getCollectionPath('eras') },
	{ title: 'Archive', url: getArchivePath() },
	{ title: 'Themes', url: getCollectionPath('themes') },
] satisfies Array<NavigationItem>;
