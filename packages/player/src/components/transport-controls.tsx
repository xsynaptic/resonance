import type { PlayerLabels } from '#types.ts';

import { Button } from '#components/button.tsx';
import {
	NextIcon,
	PauseIcon,
	PlayIcon,
	PreviousIcon,
	SkipBackIcon,
	SkipForwardIcon,
} from '#components/icons.tsx';
import { joinClassNames } from '#lib/class-names.ts';
import { usePlayer, usePlayerStoreApi } from '#store/context.tsx';

export function TransportControls({
	className,
	labels,
	skipSeconds,
}: {
	className?: string | undefined;
	labels: Pick<PlayerLabels, 'next' | 'pause' | 'play' | 'previous' | 'skipBack' | 'skipForward'>;
	// Unset renders no skip buttons
	skipSeconds?: number | undefined;
}) {
	const isPlaying = usePlayer((state) => state.status === 'playing');
	const hasQueue = usePlayer((state) => state.queue.length > 0);
	const store = usePlayerStoreApi();

	return (
		<div className={joinClassNames('player-transport', className)}>
			<Button
				aria-label={labels.previous}
				className="player-button-icon"
				disabled={!hasQueue}
				onClick={() => {
					store.getState().previous();
				}}
			>
				<PreviousIcon />
			</Button>
			{skipSeconds === undefined ? undefined : (
				<Button
					aria-label={labels.skipBack}
					className="player-button-icon player-skip"
					disabled={!hasQueue}
					onClick={() => {
						store.getState().seekBy(-skipSeconds);
					}}
				>
					<SkipBackIcon seconds={skipSeconds} />
				</Button>
			)}
			<Button
				aria-label={isPlaying ? labels.pause : labels.play}
				className="player-button-primary"
				data-state={isPlaying ? 'playing' : 'paused'}
				disabled={!hasQueue}
				onClick={() => {
					store.getState().togglePlay();
				}}
			>
				{isPlaying ? <PauseIcon /> : <PlayIcon />}
			</Button>
			{skipSeconds === undefined ? undefined : (
				<Button
					aria-label={labels.skipForward}
					className="player-button-icon player-skip"
					disabled={!hasQueue}
					onClick={() => {
						store.getState().seekBy(skipSeconds);
					}}
				>
					<SkipForwardIcon seconds={skipSeconds} />
				</Button>
			)}
			<Button
				aria-label={labels.next}
				className="player-button-icon"
				disabled={!hasQueue}
				onClick={() => {
					store.getState().next();
				}}
			>
				<NextIcon />
			</Button>
		</div>
	);
}
