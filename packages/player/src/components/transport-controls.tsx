import type { PlayerLabels } from '#types.ts';

import { Button } from '#components/button.tsx';
import {
	NextIcon,
	PauseIcon,
	PlayIcon,
	PreviousIcon,
	SeekBackIcon,
	SeekForwardIcon,
} from '#components/icons.tsx';
import { joinClassNames } from '#lib/class-names.ts';
import { usePlayer, usePlayerStoreApi } from '#store/context.tsx';
import { canStepBack, canStepForward, isAwaitingPlayback, isLoaded } from '#store/selectors.ts';

export function TransportControls({
	className,
	labels,
	seekSeconds,
}: {
	className?: string | undefined;
	labels: Pick<PlayerLabels, 'next' | 'pause' | 'play' | 'previous' | 'seekBack' | 'seekForward'>;
	// Unset renders no seek buttons
	seekSeconds?: number | undefined;
}) {
	const isTrackLoaded = usePlayer(isLoaded);
	const isBackEnabled = usePlayer(canStepBack);
	const isForwardEnabled = usePlayer(canStepForward);
	const store = usePlayerStoreApi();

	return (
		<div className={joinClassNames('player-transport', className)}>
			<Button
				aria-disabled={isBackEnabled ? undefined : true}
				aria-label={labels.previous}
				className="player-button-icon player-step"
				onClick={() => {
					store.getState().previous();
				}}
			>
				<PreviousIcon />
			</Button>
			{seekSeconds === undefined ? undefined : (
				<Button
					aria-label={labels.seekBack}
					className="player-button-icon player-seek-button"
					disabled={!isTrackLoaded}
					onClick={() => {
						store.getState().seekBy(-seekSeconds);
					}}
				>
					<SeekBackIcon seconds={seekSeconds} />
				</Button>
			)}
			<PlayButton labels={labels} />
			{seekSeconds === undefined ? undefined : (
				<Button
					aria-label={labels.seekForward}
					className="player-button-icon player-seek-button"
					disabled={!isTrackLoaded}
					onClick={() => {
						store.getState().seekBy(seekSeconds);
					}}
				>
					<SeekForwardIcon seconds={seekSeconds} />
				</Button>
			)}
			<Button
				aria-disabled={isForwardEnabled ? undefined : true}
				aria-label={labels.next}
				className="player-button-icon player-step"
				onClick={() => {
					store.getState().next();
				}}
			>
				<NextIcon />
			</Button>
		</div>
	);
}

function PlayButton({ labels }: { labels: Pick<PlayerLabels, 'pause' | 'play'> }) {
	const isPaused = usePlayer((state) => state.isPaused);
	const isAwaiting = usePlayer(isAwaitingPlayback);
	const hasQueue = usePlayer((state) => state.queue.length > 0);
	const store = usePlayerStoreApi();

	return (
		<Button
			aria-label={isPaused ? labels.play : labels.pause}
			className="player-button-primary"
			data-loading={isAwaiting ? '' : undefined}
			data-state={isPaused ? 'paused' : 'playing'}
			disabled={!hasQueue}
			onClick={() => {
				store.getState().togglePaused();
			}}
		>
			{isPaused ? <PlayIcon /> : <PauseIcon />}
		</Button>
	);
}
