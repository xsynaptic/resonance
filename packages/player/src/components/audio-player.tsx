import type { ReactNode } from 'react';
import type { StoreApi } from 'zustand/vanilla';

import type { PlayerStore } from '#store/player-store.ts';
import type { PlayerLabels, PlayerUrls } from '#types.ts';

import { OverlayToggle } from '#components/overlay-toggle.tsx';
import { PlayerOverlay } from '#components/player-overlay.tsx';
import { PlayerRoot } from '#components/player-root.tsx';
import { QueueControl } from '#components/queue-control.tsx';
import { SeekBar } from '#components/seek-bar.tsx';
import { SignalDisplay } from '#components/signal-display.tsx';
import { StatusRegion } from '#components/status-region.tsx';
import { TimeDisplay } from '#components/time-display.tsx';
import { TrackArtwork } from '#components/track-artwork.tsx';
import { TrackInfo } from '#components/track-info.tsx';
import { TransportControls } from '#components/transport-controls.tsx';
import { VolumeControl } from '#components/volume-control.tsx';
import { WaveformPanel } from '#components/waveform-panel.tsx';
import { WaveformToggle } from '#components/waveform-toggle.tsx';

export interface AudioPlayerProps {
	// Off renders no artwork at any tier, whatever the items carry
	isArtworkEnabled?: boolean | undefined;
	// Off renders no expand button and no overlay, and the mini bar keeps the Playlist in their place
	isOverlayEnabled?: boolean | undefined;
	labels: PlayerLabels;
	// Host controls rendered into the tray's header
	queueActions?: ReactNode;
	// Unset renders no seek buttons
	seekSeconds?: number | undefined;
	// Tests and secondary mounts pass a fresh store for isolation
	store?: StoreApi<PlayerStore> | undefined;
	// `undefined` renders the player inert
	urls: PlayerUrls | undefined;
}

export function AudioPlayer({
	isArtworkEnabled = true,
	isOverlayEnabled = true,
	labels,
	queueActions,
	seekSeconds,
	store,
	urls,
}: AudioPlayerProps) {
	return (
		<PlayerRoot
			aria-label={labels.nowPlaying}
			as="section"
			className="player-bar"
			store={store}
			urls={urls}
		>
			<WaveformPanel labels={labels} />
			<div className="player-bar-grid">
				{isArtworkEnabled ? <TrackArtwork /> : undefined}
				<TransportControls labels={labels} seekSeconds={seekSeconds} />
				<TrackInfo emptyLabel={labels.nowPlaying}>
					<TimeDisplay label={labels.toggleTimeMode} />
				</TrackInfo>
				<SeekBar className="player-bar-seek" label={labels.seek} />
				<StatusRegion labels={labels} />
				<SignalDisplay />
				<WaveformToggle label={labels.waveformPanel} />
				<VolumeControl labels={labels} />
				<QueueControl actions={queueActions} labels={labels} />
				{isOverlayEnabled ? <OverlayToggle label={labels.expand} /> : undefined}
			</div>
			{isOverlayEnabled ? (
				<PlayerOverlay
					isArtworkEnabled={isArtworkEnabled}
					labels={labels}
					queueActions={queueActions}
					seekSeconds={seekSeconds}
				/>
			) : undefined}
		</PlayerRoot>
	);
}
