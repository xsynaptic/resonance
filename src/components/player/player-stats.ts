import type { PlaybackReport } from '@xsynaptic/playback-stats';
import type { createPlayerStore } from '@xsynaptic/player';

import { monitorPlayback } from '@xsynaptic/playback-stats';

// Follows the `player:v1:queue` naming; set to `1` by hand, once per browser
const optOutKey = 'stats:v1:opt-out';

// The Worker refuses to open a listen below this, so nothing shorter is worth a request
const minimumSeconds = 30;

export function bindPlayerStats(
	store: ReturnType<typeof createPlayerStore>,
	identify: () => string | undefined,
): () => void {
	if (import.meta.env.DEV || navigator.doNotTrack === '1' || isOptedOut()) return doNothing;

	const element = store.getState().getMediaElement();

	if (element) return monitorPlayback(element, { identify, minimumSeconds, onReport });

	// The engine is built on the first load, so the monitor waits for the element to exist
	let unmonitor: (() => void) | undefined;

	const unsubscribe = store.subscribe(() => {
		const loaded = store.getState().getMediaElement();

		if (!loaded) return;

		unsubscribe();
		unmonitor = monitorPlayback(loaded, { identify, minimumSeconds, onReport });
	});

	return () => {
		unsubscribe();
		unmonitor?.();
	};
}

function doNothing(): void {
	// Nothing was bound, so there is nothing to unbind
}

// A browser that refuses storage has set nothing, so a throw reads as not opted out
function isOptedOut(): boolean {
	try {
		return localStorage.getItem(optOutKey) === '1';
	} catch {
		return false;
	}
}

// The result is ignored: the next report carries the same running total, so a dropped one costs nothing
function onReport({ heardSeconds, itemId, listenId }: PlaybackReport): void {
	navigator.sendBeacon(
		'/api/listen',
		JSON.stringify({ id: listenId, mixId: itemId, seconds: heardSeconds }),
	);
}
