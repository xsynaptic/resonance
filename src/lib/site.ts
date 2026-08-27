import { SITE_TITLE } from '@xsynaptic/shared/constants';
import { FILES_URL } from 'astro:env/server';

export const site = {
	description: 'Mixes, reviews, and lists from DJ Basilisk.',
	title: SITE_TITLE,
} as const;

export const downloadBaseUrl = new URL('artifacts/', FILES_URL).href;
