import type { MenuItem } from '#components/menu/menu-types.ts';

export const menuHeaderItems = [
	{ title: 'Mixes', url: '/mixes' },
	{ title: 'Reviews', url: '/reviews' },
	{
		children: [
			{ title: 'Selections', url: '/formats/selections' },
			{ title: 'Album Artwork', url: '/formats/album-artwork' },
			{ title: 'Notes', url: '/formats/notes' },
			{ title: 'Quotations', url: '/formats/quotations' },
			{ title: 'Tracks', url: '/formats/tracks' },
			{ title: 'Articles', url: '/formats/articles' },
		],
		title: 'Blog',
		url: '/blog',
	},
	{
		children: [
			{ rel: 'me', title: 'Facebook', url: 'https://www.facebook.com/dj.basilisk' },
			{ rel: 'me', title: 'Instagram', url: 'https://www.instagram.com/djbasilisk' },
			{ rel: 'me', title: 'Mixcloud', url: 'https://www.mixcloud.com/basilisk/' },
			{ rel: 'me', title: 'SoundCloud', url: 'https://soundcloud.com/djbasilisk' },
		],
		title: 'Profile',
		url: '/profile',
	},
	{
		children: [
			{ title: 'Frequently Asked Questions', url: '/frequently-asked-questions' },
			{ title: 'Resources', url: '/resources' },
			{ title: 'Booking', url: '/booking' },
			{ title: 'Contact', url: '/contact' },
		],
		title: 'About',
		url: '/about',
	},
] satisfies Array<MenuItem>;
