import type { NavigationItem } from '#components/navigation/navigation-types.ts';

import { getCollectionPath, getContentPath } from '#lib/utils/routing.ts';

export const navigationHeaderItems = [
	{ title: 'Mixes', url: getCollectionPath('mixes') },
	{ title: 'Reviews', url: getCollectionPath('reviews') },
	{
		children: [
			{ title: 'Selections', url: getContentPath('formats', 'selections') },
			{ title: 'Album Artwork', url: getContentPath('formats', 'album-artwork') },
			{ title: 'Notes', url: getContentPath('formats', 'notes') },
			{ title: 'Quotations', url: getContentPath('formats', 'quotations') },
			{ title: 'Tracks', url: getContentPath('formats', 'tracks') },
			{ title: 'Articles', url: getContentPath('formats', 'articles') },
		],
		title: 'Blog',
		url: getCollectionPath('posts'),
	},
	{
		children: [
			{ rel: 'me', title: 'Facebook', url: 'https://www.facebook.com/dj.basilisk' },
			{ rel: 'me', title: 'Instagram', url: 'https://www.instagram.com/djbasilisk' },
			{ rel: 'me', title: 'Mixcloud', url: 'https://www.mixcloud.com/basilisk/' },
			{ rel: 'me', title: 'SoundCloud', url: 'https://soundcloud.com/djbasilisk' },
			{ rel: 'me', title: 'Threads', url: 'https://www.threads.com/@djbasilisk' },
			{ rel: 'me', title: 'X', url: 'https://x.com/djbasilisk' },
		],
		title: 'Profile',
		url: getContentPath('pages', 'profile'),
	},
	{
		children: [
			{
				title: 'Frequently Asked Questions',
				url: getContentPath('pages', 'frequently-asked-questions'),
			},
			{ title: 'Resources', url: getContentPath('pages', 'resources') },
			{ title: 'Booking', url: getContentPath('pages', 'booking') },
			{ title: 'Contact', url: getContentPath('pages', 'contact') },
		],
		title: 'About',
		url: getContentPath('pages', 'about'),
	},
] satisfies Array<NavigationItem>;
