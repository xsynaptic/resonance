import { siteTitle } from '@xsynaptic/shared/constants';
import {
	FILES_URL,
	LISTENING_TIME_ENABLED,
	PLAYER_ENABLED,
	PLAYER_OVERLAY_ENABLED,
} from 'astro:env/server';

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

// Dev serves audio locally, so only a build has a remote host worth connecting to early
export const audioOrigin = import.meta.env.DEV ? undefined : new URL(FILES_URL).origin;

// Dev always shows the player and its overlay; a build shows each only where the deploying machine sets its variable
export const isPlayerEnabled = import.meta.env.DEV || PLAYER_ENABLED;
export const isPlayerOverlayEnabled = import.meta.env.DEV || PLAYER_OVERLAY_ENABLED;

// Listen counts render unflagged; listening time waits until the numbers are worth showing
export const isListeningTimeEnabled = import.meta.env.DEV || LISTENING_TIME_ENABLED;
