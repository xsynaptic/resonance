import type { PlaybackReport } from '@xsynaptic/playback-stats';
import type { createPlayerStore } from '@xsynaptic/player';

import { monitorPlayback } from '@xsynaptic/playback-stats';

import { isOptedOut } from '#components/player/player-opt-out.ts';

// The Worker refuses to open a listen below this, so nothing shorter is worth a request
const minimumSeconds = 30;

export function bindPlayerStats(
	store: ReturnType<typeof createPlayerStore>,
	identify: () => string | undefined,
): () => void {
	if (import.meta.env.DEV || navigator.doNotTrack === '1' || isOptedOut()) return doNothing;

	const monitored = new Map<HTMLMediaElement, () => void>();

	const monitor = (): void => {
		const element = store.getState().getMediaElement();

		if (!element || monitored.has(element)) return;

		monitored.set(element, monitorPlayback(element, { identify, minimumSeconds, onReport }));
	};

	monitor();

	const unsubscribe = store.subscribe(monitor);

	return () => {
		unsubscribe();
		for (const unmonitor of monitored.values()) unmonitor();
	};
}

function doNothing(): void {
	// Nothing was bound, so there is nothing to unbind
}

// The result is ignored: the next report carries the same running total, so a dropped one costs nothing
function onReport({ heardSeconds, itemId, listenId }: PlaybackReport): void {
	navigator.sendBeacon(
		'/api/listen',
		JSON.stringify({ id: listenId, mixId: itemId, seconds: heardSeconds }),
	);
}
