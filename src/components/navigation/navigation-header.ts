import type { NavigationItem } from '#components/navigation/navigation-types.ts';

import { getCollectionUrl, getContentUrl } from '#lib/utils/routing.ts';

export const navigationHeaderItems = [
	{ title: 'Mixes', url: getCollectionUrl('mixes') },
	{ title: 'Reviews', url: getCollectionUrl('reviews') },
	{
		children: [
			{ title: 'Selections', url: getContentUrl('formats', 'selections') },
			{ title: 'Album Artwork', url: getContentUrl('formats', 'album-artwork') },
			{ title: 'Notes', url: getContentUrl('formats', 'notes') },
			{ title: 'Quotations', url: getContentUrl('formats', 'quotations') },
			{ title: 'Tracks', url: getContentUrl('formats', 'tracks') },
			{ title: 'Articles', url: getContentUrl('formats', 'articles') },
		],
		title: 'Blog',
		url: getCollectionUrl('posts'),
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
		url: getContentUrl('pages', 'profile'),
	},
	{
		children: [
			{
				title: 'Frequently Asked Questions',
				url: getContentUrl('pages', 'frequently-asked-questions'),
			},
			{ title: 'Resources', url: getContentUrl('pages', 'resources') },
			{ title: 'Booking', url: getContentUrl('pages', 'booking') },
			{ title: 'Contact', url: getContentUrl('pages', 'contact') },
		],
		title: 'About',
		url: getContentUrl('pages', 'about'),
	},
] satisfies Array<NavigationItem>;
