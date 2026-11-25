import type { PlayerStoreApi } from '@xsynaptic/plazmoid-core';
import type { PlaybackReport } from '@xsynaptic/plazmoid-stats';

import { loadedTrack, whenMediaElement } from '@xsynaptic/plazmoid-core';
import { monitorPlayback } from '@xsynaptic/plazmoid-stats';

import { isOptedOut } from '#components/player/player-opt-out.ts';

// The Worker opens a Listen on the same threshold, so nothing shorter is worth a request
const minimumSeconds = 30;

export async function bindPlayerStats(store: PlayerStoreApi): Promise<void> {
	if (import.meta.env.DEV || navigator.doNotTrack === '1' || isOptedOut()) return;

	const element = await whenMediaElement(store);

	monitorPlayback(element, {
		identify: () => loadedTrack(store.getState())?.trackId,
		minimumSeconds,
		onReport,
	});
}

// The result is ignored: the next report carries the same running total, so a dropped one costs nothing
function onReport(report: PlaybackReport): void {
	navigator.sendBeacon('/api/listen', JSON.stringify(report));
}
