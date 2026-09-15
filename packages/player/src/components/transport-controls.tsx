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
import { canStepBack, canStepForward, isAwaitingPlayback, isLoaded } from '#store/selectors.ts';

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
			{skipSeconds === undefined ? undefined : (
				<Button
					aria-label={labels.skipBack}
					className="player-button-icon player-skip"
					disabled={!isTrackLoaded}
					onClick={() => {
						store.getState().seekBy(-skipSeconds);
					}}
				>
					<SkipBackIcon seconds={skipSeconds} />
				</Button>
			)}
			<PlayButton labels={labels} />
			{skipSeconds === undefined ? undefined : (
				<Button
					aria-label={labels.skipForward}
					className="player-button-icon player-skip"
					disabled={!isTrackLoaded}
					onClick={() => {
						store.getState().seekBy(skipSeconds);
					}}
				>
					<SkipForwardIcon seconds={skipSeconds} />
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
	const isPlayIntended = usePlayer((state) => state.isPlayIntended);
	const isAwaiting = usePlayer(isAwaitingPlayback);
	const hasQueue = usePlayer((state) => state.queue.length > 0);
	const store = usePlayerStoreApi();

	return (
		<Button
			aria-label={isPlayIntended ? labels.pause : labels.play}
			className="player-button-primary"
			data-loading={isAwaiting ? '' : undefined}
			data-state={isPlayIntended ? 'playing' : 'paused'}
			disabled={!hasQueue}
			onClick={() => {
				store.getState().togglePlay();
			}}
		>
			{isPlayIntended ? <PauseIcon /> : <PlayIcon />}
		</Button>
	);
}
