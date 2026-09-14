import { useSyncExternalStore } from 'react';

import type { QueueCuePoint } from '#types.ts';

import { formatClock } from '#lib/format.ts';
import { usePlayer, usePlayerStoreApi } from '#store/context.tsx';
import { displayedItem, isLoaded } from '#store/selectors.ts';

const noCuePoints: ReadonlyArray<QueueCuePoint> = [];

export function OverlayTracklist() {
	const item = usePlayer(displayedItem);
	const isTrackLoaded = usePlayer(isLoaded);
	const store = usePlayerStoreApi();

	const cuePoints = item?.cuePoints ?? noCuePoints;

	const currentCue = useSyncExternalStore(store.subscribe, () =>
		isTrackLoaded ? cueIndexAt(cuePoints, store.getState().currentTimeSeconds) : undefined,
	);

	return (
		<ol className="player-overlay-tracklist">
			{cuePoints.map((cue, index) => (
				<li key={`${String(cue.startSeconds)}:${cue.title}`}>
					<button
						aria-current={index === currentCue ? 'true' : undefined}
						className="player-overlay-cue"
						disabled={!isTrackLoaded}
						onClick={() => {
							store.getState().seek(cue.startSeconds);
						}}
						type="button"
					>
						<span className="player-overlay-cue-time">{formatClock(cue.startSeconds)}</span>
						{cue.artistLine === '' ? undefined : (
							<span className="player-overlay-cue-artist">{cue.artistLine}</span>
						)}
						<span className="player-overlay-cue-title">{cue.title}</span>
					</button>
				</li>
			))}
		</ol>
	);
}

function cueIndexAt(cuePoints: ReadonlyArray<QueueCuePoint>, seconds: number): number | undefined {
	let found: number | undefined;

	for (const [index, cue] of cuePoints.entries()) {
		if (cue.startSeconds > seconds) break;

		found = index;
	}

	return found;
}
