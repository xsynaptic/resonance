import type { MenuItem } from '#components/menu/menu-types.ts';

// Term list pages not in the header
export const menuFooterItems = [
	{ title: 'Artists', url: '/artists' },
	{ title: 'Styles', url: '/styles' },
	{ title: 'Labels', url: '/labels' },
	{ title: 'Series', url: '/series' },
	{ title: 'Eras', url: '/eras' },
	{ title: 'Formats', url: '/formats' },
	{ title: 'Topics', url: '/topics' },
] satisfies Array<MenuItem>;
