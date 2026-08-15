export interface MenuItem {
	children?: Array<MenuItem> | undefined;
	rel?: string | undefined;
	title: string;
	url: string;
}

// Header menu; mirrors the production site
export const menuItems: Array<MenuItem> = [
	{ title: 'Mixes', url: '/mixes' },
	{
		children: [
			{ rel: 'me', title: 'Facebook', url: 'https://www.facebook.com/dj.basilisk' },
			{ rel: 'me', title: 'Mixcloud', url: 'https://www.mixcloud.com/basilisk/' },
			{ rel: 'me', title: 'SoundCloud', url: 'https://soundcloud.com/djbasilisk' },
		],
		title: 'Profile',
		url: '/profile',
	},
	{ title: 'Reviews', url: '/reviews' },
	{
		children: [
			{ title: 'Selections', url: '/formats/selections' },
			{ title: 'Album Artwork', url: '/formats/album-artwork' },
		],
		title: 'Blog',
		url: '/blog',
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
];

// Term list pages not in the header
export const footerMenuItems: Array<MenuItem> = [
	{ title: 'Artists', url: '/artists' },
	{ title: 'Styles', url: '/styles' },
	{ title: 'Labels', url: '/labels' },
	{ title: 'Series', url: '/series' },
	{ title: 'Eras', url: '/eras' },
	{ title: 'Formats', url: '/formats' },
	{ title: 'Topics', url: '/topics' },
];
