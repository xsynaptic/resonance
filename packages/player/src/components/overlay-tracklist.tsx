import type { QueueCuePoint } from '#types.ts';

import { formatClock } from '#lib/format.ts';
import { usePlayer, usePlayerStoreApi } from '#store/context.tsx';
import { currentCue, displayedItem, isLoaded } from '#store/selectors.ts';

const noCuePoints: ReadonlyArray<QueueCuePoint> = [];

export function OverlayTracklist() {
	const item = usePlayer(displayedItem);
	const isTrackLoaded = usePlayer(isLoaded);
	const playingCue = usePlayer(currentCue);
	const store = usePlayerStoreApi();

	const cuePoints = item?.cuePoints ?? noCuePoints;

	return (
		<ol className="player-overlay-tracklist">
			{cuePoints.map((cue) => (
				<li key={`${String(cue.startSeconds)}:${cue.title}`}>
					<button
						aria-current={cue === playingCue ? 'true' : undefined}
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
