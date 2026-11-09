import type { NavigationItem } from '#components/navigation/navigation-types.ts';

import { t } from '#lib/i18n/i18n-strings.ts';

export const navigationFooterItems = [
	{ rel: 'me', title: t('nav.soundcloud.label'), url: 'https://soundcloud.com/djbasilisk' },
	{ rel: 'me', title: t('nav.mixcloud.label'), url: 'https://www.mixcloud.com/basilisk/' },
	{ rel: 'me', title: t('nav.facebook.label'), url: 'https://www.facebook.com/dj.basilisk' },
	{ rel: 'me', title: t('nav.instagram.label'), url: 'https://www.instagram.com/djbasilisk' },
	{ rel: 'me', title: t('nav.threads.label'), url: 'https://www.threads.com/@djbasilisk' },
	{ rel: 'me', title: t('nav.bluesky.label'), url: 'https://bsky.app/profile/djbasilisk.com' },
	{ rel: 'me', title: t('nav.bandcamp.label'), url: 'https://bandcamp.com/djbasilisk' },
	{ rel: 'me', title: t('nav.x.label'), url: 'https://x.com/djbasilisk' },
] satisfies Array<NavigationItem>;
