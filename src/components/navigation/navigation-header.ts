import { getCollectionPath, getContentPath } from '@xsynaptic/shared/routing';

import type { NavigationItem } from '#components/navigation/navigation-types.ts';

import { getArchivePath } from '#lib/archive/archive-data.ts';

export const navigationHeaderItems = [
	{ title: 'Mixes', url: getCollectionPath('mixes') },
	{ title: 'Reviews', url: getCollectionPath('reviews') },
	{ title: 'Posts', url: getCollectionPath('posts') },
	{ title: 'Styles', url: getCollectionPath('styles') },
	{
		children: [
			{ title: 'Artists', url: getCollectionPath('artists') },
			{ title: 'Labels', url: getCollectionPath('labels') },
			{ title: 'Regions', url: getCollectionPath('regions') },
			{ title: 'Eras', url: getCollectionPath('eras') },
			{ title: 'Series', url: getCollectionPath('series') },
			{ title: 'Themes', url: getCollectionPath('themes') },
			{ title: 'Archive', url: getArchivePath() },
		],
		title: 'Explore',
	},
	{
		children: [
			{ title: 'Profile', url: getContentPath('pages', 'profile') },
			{ title: 'FAQ', url: getContentPath('pages', 'frequently-asked-questions') },
			{ title: 'Resources', url: getContentPath('pages', 'resources') },
			{ title: 'Contact', url: getContentPath('pages', 'contact') },
		],
		title: 'About',
		url: getContentPath('pages', 'about'),
	},
] satisfies Array<NavigationItem>;
