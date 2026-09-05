import type { ReactNode } from 'react';
import type { StoreApi } from 'zustand/vanilla';

import type { PlayerStore } from '#store/player-store.ts';
import type { MiniPlayerLabels, PlayerLabels, PlayerUrls } from '#types.ts';

import { PlayerRoot } from '#components/player-root.tsx';
import { QueueControl } from '#components/queue-control.tsx';
import { SeekBar } from '#components/seek-bar.tsx';
import { SignalDisplay } from '#components/signal-display.tsx';
import { StatusRegion } from '#components/status-region.tsx';
import { TimeDisplay } from '#components/time-display.tsx';
import { TrackInfo } from '#components/track-info.tsx';
import { TransportControls } from '#components/transport-controls.tsx';
import { VolumeControl } from '#components/volume-control.tsx';

export type AudioPlayerProps = AudioPlayerChrome & {
	// Tests and secondary mounts pass a fresh store for isolation
	store?: StoreApi<PlayerStore> | undefined;
	// `undefined` renders the player inert
	urls: PlayerUrls | undefined;
};

// Mini is the full bar minus the signal display and the queue tray
type AudioPlayerChrome =
	| { labels: MiniPlayerLabels; variant: 'mini' }
	| {
			labels: PlayerLabels;
			// Host controls rendered into the tray's header
			queueActions?: ReactNode;
			variant?: 'full';
	  };

export function AudioPlayer(props: AudioPlayerProps) {
	const { labels, store, urls } = props;
	const isFull = props.variant !== 'mini';

	return (
		<PlayerRoot
			aria-label={labels.nowPlaying}
			as="section"
			className="player-bar"
			store={store}
			urls={urls}
		>
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
				{isFull ? <SignalDisplay /> : undefined}
				<VolumeControl label={labels.volume} />
				{isFull ? <QueueControl actions={props.queueActions} labels={props.labels} /> : undefined}
			</div>
		</PlayerRoot>
	);
}
