import type { QueueItem } from '#types.ts';

export interface MediaSessionHandlers {
	next: () => void;
	pause: () => void;
	play: () => void;
	previous: () => void;
}

export function bindMediaSession(handlers: MediaSessionHandlers): void {
	if (!('mediaSession' in navigator)) return;

	const bindings: Array<[MediaSessionAction, MediaSessionActionHandler]> = [
		['play', handlers.play],
		['pause', handlers.pause],
		['previoustrack', handlers.previous],
		['nexttrack', handlers.next],
	];

	for (const [action, handler] of bindings) {
		// Throws for an action the browser does not support
		try {
			navigator.mediaSession.setActionHandler(action, handler);
		} catch {
			continue;
		}
	}
}

export function clearMediaMetadata(): void {
	if (!('mediaSession' in navigator)) return;

	// eslint-disable-next-line unicorn/no-null -- the platform API clears with null
	navigator.mediaSession.metadata = null;
}

export function setMediaMetadata(item: QueueItem): void {
	if (!('mediaSession' in navigator)) return;

	navigator.mediaSession.metadata = new MediaMetadata({
		album: item.releaseTitle,
		artist: item.artistLine,
		artwork: item.artworkUrl ? [{ src: item.artworkUrl }] : [],
		title: item.title,
	});
}

export function setMediaPlaybackState(state: MediaSessionPlaybackState): void {
	if (!('mediaSession' in navigator)) return;

	navigator.mediaSession.playbackState = state;
}
