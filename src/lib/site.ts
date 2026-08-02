import { FILES_URL } from 'astro:env/server';

export const site = {
	description: 'Mixes, reviews, and lists from DJ Basilisk.',
	title: 'DJ Basilisk',
} as const;

export const downloadBaseUrl = new URL('artifacts/', FILES_URL).href;
