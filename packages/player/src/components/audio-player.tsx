import type { ReactNode } from 'react';
import type { StoreApi } from 'zustand/vanilla';

import type { PlayerStore } from '#store/player-store.ts';
import type { PlayerLabels, PlayerUrls } from '#types.ts';

import { PlayerRoot } from '#components/player-root.tsx';
import { QueueControl } from '#components/queue-control.tsx';
import { SeekBar } from '#components/seek-bar.tsx';
import { SignalDisplay } from '#components/signal-display.tsx';
import { StatusRegion } from '#components/status-region.tsx';
import { TimeDisplay } from '#components/time-display.tsx';
import { TrackInfo } from '#components/track-info.tsx';
import { TransportControls } from '#components/transport-controls.tsx';
import { VolumeControl } from '#components/volume-control.tsx';

export interface AudioPlayerProps {
	labels: PlayerLabels;
	// Host controls rendered into the tray's header
	queueActions?: ReactNode;
	// Unset renders no skip buttons
	skipSeconds?: number | undefined;
	// Tests and secondary mounts pass a fresh store for isolation
	store?: StoreApi<PlayerStore> | undefined;
	// `undefined` renders the player inert
	urls: PlayerUrls | undefined;
	variant?: 'compact' | 'expanded' | undefined;
}

export function AudioPlayer({
	labels,
	queueActions,
	skipSeconds,
	store,
	urls,
	variant,
}: AudioPlayerProps) {
	return (
		<PlayerRoot
			aria-label={labels.nowPlaying}
			as="section"
			className="player-bar"
			data-layout={variant}
			store={store}
			urls={urls}
		>
			<div className="player-bar-grid">
				<TransportControls labels={labels} skipSeconds={skipSeconds} />
				<TrackInfo emptyLabel={labels.nowPlaying}>
					<TimeDisplay label={labels.toggleTimeMode} />
				</TrackInfo>
				<SeekBar className="player-bar-seek" label={labels.seek} />
				<StatusRegion labels={labels} />
				<SignalDisplay />
				<VolumeControl labels={labels} />
				<QueueControl actions={queueActions} labels={labels} />
			</div>
		</PlayerRoot>
	);
}
