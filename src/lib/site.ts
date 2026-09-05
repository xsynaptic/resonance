import { siteTitle } from '@xsynaptic/shared/constants';
import { FILES_URL, PLAYER_ENABLED } from 'astro:env/server';

export const site = {
	description: 'Mixes, reviews, and lists from DJ Basilisk.',
	title: siteTitle,
} as const;

export const downloadBaseUrl = new URL('artifacts/', FILES_URL).href;

export const streamBaseUrl = new URL('stream/', FILES_URL).href;

// Dev always shows the player; a build shows it only where the deploying machine sets the variable
export const isPlayerEnabled = import.meta.env.DEV || PLAYER_ENABLED;
