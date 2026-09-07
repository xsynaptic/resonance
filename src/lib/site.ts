import { siteTitle } from '@xsynaptic/shared/constants';
import { FILES_URL, PLAYER_ENABLED } from 'astro:env/server';

export const site = {
	description: 'Mixes, reviews, and lists from DJ Basilisk.',
	title: siteTitle,
} as const;

// Curated for the Person node's `sameAs`, kept separate from the navigation's `rel="me"` links
export const identityLinks = [
	'https://www.facebook.com/dj.basilisk',
	'https://www.instagram.com/djbasilisk',
	'https://www.mixcloud.com/basilisk/',
	'https://soundcloud.com/djbasilisk',
	'https://www.threads.com/@djbasilisk',
	'https://x.com/djbasilisk',
] as const;

export const downloadBaseUrl = new URL('artifacts/', FILES_URL).href;

// Both files exist locally, so dev serves its own rather than reading the production box
// Downloads stay remote, because those are links a visitor follows rather than files the player reads
export const streamBaseUrl = import.meta.env.DEV ? '/stream/' : new URL('stream/', FILES_URL).href;

export const waveformBaseUrl = import.meta.env.DEV
	? '/waveform/'
	: new URL('waveform/', FILES_URL).href;

// Dev always shows the player; a build shows it only where the deploying machine sets the variable
export const isPlayerEnabled = import.meta.env.DEV || PLAYER_ENABLED;
