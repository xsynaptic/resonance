import type { ReactNode } from 'react';
import type { StoreApi } from 'zustand/vanilla';

import { useEffect } from 'react';

import type { PlayerStore } from '#store/player-store.ts';
import type { MiniPlayerLabels, PlayerLabels, PlayerUrls } from '#types.ts';

import { Button } from '#components/button.tsx';
import { QueueIcon } from '#components/icons.tsx';
import { QueueTray } from '#components/queue-tray.tsx';
import { SeekBar } from '#components/seek-bar.tsx';
import { SignalDisplay } from '#components/signal-display.tsx';
import { TimeDisplay } from '#components/time-display.tsx';
import { TrackInfo } from '#components/track-info.tsx';
import { TransportControls } from '#components/transport-controls.tsx';
import { VolumeControl } from '#components/volume-control.tsx';
import { PlayerStoreProvider, usePlayer } from '#store/context.tsx';
import { playerStore } from '#store/player-store.ts';

export type MusicPlayerProps = PlayerChromeProps & {
	// Tests pass a fresh store for isolation
	store?: StoreApi<PlayerStore>;
	// `undefined` renders the player inert
	urls: PlayerUrls | undefined;
};

// Mini is the full bar minus the signal display and the queue tray
type PlayerChromeProps =
	| { labels: MiniPlayerLabels; variant: 'mini' }
	| {
			labels: PlayerLabels;
			// Host controls rendered into the tray's header
			queueActions?: ReactNode;
			showSignalDisplay?: boolean;
			variant?: 'full';
	  };

export function MusicPlayer(props: MusicPlayerProps) {
	const { store = playerStore, urls } = props;

	useEffect(() => {
		store.getState().configure({ urls });
	}, [store, urls]);

	return (
		<PlayerStoreProvider store={store}>
			<PlayerBar chrome={props} />
		</PlayerStoreProvider>
	);
}

function PlayerBar({ chrome }: { chrome: PlayerChromeProps }) {
	const { labels } = chrome;
	const isFull = chrome.variant !== 'mini';

	return (
		<section aria-label={labels.nowPlaying} className="player-bar">
			<div className="player-bar-lead">
				<TransportControls labels={labels} />
				<TrackInfo emptyLabel={labels.nowPlaying} />
			</div>
			<div className="player-bar-scrub">
				<TimeDisplay />
				<SeekBar label={labels.seek} />
			</div>
			<div className="player-bar-tail">
				<StatusRegion labels={labels} />
				{isFull && chrome.showSignalDisplay !== false ? <SignalDisplay /> : undefined}
				<VolumeControl label={labels.volume} />
				{isFull ? <QueueControl actions={chrome.queueActions} labels={chrome.labels} /> : undefined}
			</div>
		</section>
	);
}

function QueueControl({ actions, labels }: { actions: ReactNode; labels: PlayerLabels }) {
	const toggleTray = usePlayer((state) => state.toggleTray);
	const isTrayOpen = usePlayer((state) => state.isTrayOpen);
	const count = usePlayer((state) => state.queue.length);

	return (
		<div className="player-queue">
			<QueueTray actions={actions} labels={labels} />
			<Button
				aria-expanded={isTrayOpen}
				aria-label={labels.queue}
				className="player-button-icon"
				onClick={toggleTray}
			>
				<QueueIcon />
			</Button>
			{count > 0 ? <span className="player-queue-badge">{count}</span> : undefined}
		</div>
	);
}

// Empty outside the transient states, so the live region never announces silence
function StatusRegion({
	labels,
}: {
	labels: Pick<MiniPlayerLabels, 'capped' | 'error' | 'loading'>;
}) {
	const status = usePlayer((state) => state.status);
	const messages: Partial<Record<typeof status, string>> = {
		capped: labels.capped,
		error: labels.error,
		loading: labels.loading,
	};

	return (
		<span aria-live="polite" className="player-status" data-status={status} role="status">
			{messages[status] ?? ''}
		</span>
	);
}
