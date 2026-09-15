import type { MouseEvent, ReactNode } from 'react';

import { useEffect, useRef } from 'react';

import type { PlayerLabels } from '#types.ts';

import { Button } from '#components/button.tsx';
import { ChevronDownIcon } from '#components/icons.tsx';
import { OverlayTabs } from '#components/overlay-tabs.tsx';
import { StatusRegion } from '#components/status-region.tsx';
import { TimeDisplay } from '#components/time-display.tsx';
import { TrackArtwork } from '#components/track-artwork.tsx';
import { TrackInfo } from '#components/track-info.tsx';
import { TransportControls } from '#components/transport-controls.tsx';
import { VolumeControl } from '#components/volume-control.tsx';
import { WaveformPanelSurface } from '#components/waveform-panel-surface.tsx';
import { joinClassNames } from '#lib/class-names.ts';
import { usePlayerStoreApi } from '#store/context.tsx';

export interface PlayerOverlayProps {
	isArtworkEnabled?: boolean | undefined;
	labels: PlayerLabels;
	queueActions?: ReactNode;
	skipSeconds?: number | undefined;
}

// Two columns from a 64rem body inside 1rem padding, beside a 32rem deck
const artworkSizes =
	'(width >= 66rem) min(100vw - 37rem, 100vh - 5.5rem, 900px), min(100vw - 2rem, 55vh, 40rem)';

// A link inside leaves for its page, so the overlay closes rather than covering it
export function OverlayContent({
	className,
	isArtworkEnabled = true,
	labels,
	queueActions,
	skipSeconds,
}: PlayerOverlayProps & { className?: string | undefined }) {
	const store = usePlayerStoreApi();
	const closeRef = useRef<HTMLButtonElement>(null);

	// A first open mounts this after the dialog's own focus call found no button; standalone it takes no focus
	useEffect(() => {
		if (closeRef.current?.closest('dialog[open]')) closeRef.current.focus();
	}, []);

	return (
		<div
			className={joinClassNames('player-overlay-body', className)}
			onClickCapture={(event) => {
				if (isLeavingPage(event)) store.getState().setOverlayOpen(false);
			}}
		>
			<div className="player-overlay-layout">
				<Button
					aria-label={labels.collapse}
					className="player-button-icon player-overlay-close"
					onClick={() => {
						store.getState().setOverlayOpen(false);
					}}
					ref={closeRef}
				>
					<ChevronDownIcon />
				</Button>
				{isArtworkEnabled ? (
					<TrackArtwork className="player-overlay-artwork" sizes={artworkSizes} />
				) : undefined}
				<div className="player-overlay-deck">
					<TrackInfo className="player-overlay-track" emptyLabel={labels.nowPlaying} />
					<div className="player-overlay-scrub">
						<WaveformPanelSurface labels={labels} />
						<StatusRegion labels={labels} />
					</div>
					<div className="player-overlay-meter">
						<TimeDisplay label={labels.toggleTimeMode} />
						<VolumeControl labels={labels} />
					</div>
					<TransportControls labels={labels} skipSeconds={skipSeconds} />
					<OverlayTabs actions={queueActions} labels={labels} />
				</div>
			</div>
		</div>
	);
}

// The client router leaves a modified click, another target and a download to the browser, which keeps this page
function isLeavingPage(event: MouseEvent): boolean {
	if (isModifiedClick(event)) return false;

	const link = event.target instanceof Element ? event.target.closest('a[href]') : undefined;
	if (!(link instanceof HTMLAnchorElement)) return false;

	return (link.target === '' || link.target === '_self') && !link.hasAttribute('download');
}

function isModifiedClick(event: MouseEvent): boolean {
	return event.button !== 0 || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey;
}
