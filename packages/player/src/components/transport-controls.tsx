import type { MiniPlayerLabels } from '#types.ts';

import { Button } from '#components/button.tsx';
import { NextIcon, PauseIcon, PlayIcon, PreviousIcon } from '#components/icons.tsx';
import { usePlayer } from '#store/context.tsx';

export function TransportControls({
	labels,
}: {
	labels: Pick<MiniPlayerLabels, 'next' | 'pause' | 'play' | 'previous'>;
}) {
	const isPlaying = usePlayer((state) => state.status === 'playing');
	const hasQueue = usePlayer((state) => state.queue.length > 0);
	const togglePlay = usePlayer((state) => state.togglePlay);
	const next = usePlayer((state) => state.next);
	const previous = usePlayer((state) => state.previous);

	return (
		<div className="player-transport">
			<Button
				aria-label={labels.previous}
				className="player-button-icon"
				disabled={!hasQueue}
				onClick={previous}
			>
				<PreviousIcon />
			</Button>
			<Button
				aria-label={isPlaying ? labels.pause : labels.play}
				className="player-button-primary"
				data-state={isPlaying ? 'playing' : 'paused'}
				disabled={!hasQueue}
				onClick={togglePlay}
			>
				{isPlaying ? <PauseIcon /> : <PlayIcon />}
			</Button>
			<Button
				aria-label={labels.next}
				className="player-button-icon"
				disabled={!hasQueue}
				onClick={next}
			>
				<NextIcon />
			</Button>
		</div>
	);
}
