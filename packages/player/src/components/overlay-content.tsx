import type { MouseEvent, ReactNode, RefObject } from 'react';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';

import type { PlayerLabels } from '#types.ts';

import { Button } from '#components/button.tsx';
import { CloseIcon } from '#components/icons.tsx';
import { OverlaySheets } from '#components/overlay-sheets.tsx';
import { OverlayTabs } from '#components/overlay-tabs.tsx';
import { PanelToggle } from '#components/panel-toggle.tsx';
import { SeekBar } from '#components/seek-bar.tsx';
import { StatusRegion } from '#components/status-region.tsx';
import { TimeDisplay } from '#components/time-display.tsx';
import { TrackArtwork } from '#components/track-artwork.tsx';
import { TrackInfo } from '#components/track-info.tsx';
import { TransportControls } from '#components/transport-controls.tsx';
import { VolumeControl } from '#components/volume-control.tsx';
import { WaveformPanelSurface } from '#components/waveform-panel-surface.tsx';
import { joinClassNames } from '#lib/class-names.ts';
import { usePlayer, usePlayerStoreApi } from '#store/context.tsx';

export interface PlayerOverlayProps {
	isArtworkEnabled?: boolean | undefined;
	labels: PlayerLabels;
	queueActions?: ReactNode;
	seekSeconds?: number | undefined;
}

type OverlayLayout = 'columns' | 'phone';

// Rem, so the switch follows the reader's font size as a media query would
const columnsMinWidthRem = 40;
const columnsMinHeightRem = 30;

// The stylesheet's artwork caps for each layout, less the overlay's padding
const artworkSizes =
	'(width >= 40rem) and (height >= 30rem) min(40vw, 100vh - 2rem, 900px), min(100vw - 2rem, 60vh, 40rem)';

// A link inside leaves for its page, so the overlay closes rather than covering it
export function OverlayContent({
	className,
	isArtworkEnabled = true,
	labels,
	queueActions,
	seekSeconds,
}: PlayerOverlayProps & { className?: string | undefined }) {
	const isPanelOpen = usePlayer((state) => state.isPanelOpen);
	const store = usePlayerStoreApi();
	const bodyRef = useRef<HTMLDivElement>(null);
	const closeRef = useRef<HTMLButtonElement>(null);
	const layout = useOverlayLayout(bodyRef);

	// A first open mounts this after the dialog's own focus call found no button; standalone it takes no focus
	useEffect(() => {
		if (closeRef.current?.closest('dialog[open]')) closeRef.current.focus();
	}, []);

	return (
		<div
			className={joinClassNames('player-overlay-body', className)}
			data-layout={layout}
			onClickCapture={(event) => {
				if (isLeavingPage(event)) store.getState().setOverlayOpen(false);
			}}
			ref={bodyRef}
		>
			<div className="player-overlay-layout">
				{isArtworkEnabled ? (
					<div className="player-overlay-art">
						<TrackArtwork className="player-overlay-artwork" sizes={artworkSizes} />
					</div>
				) : undefined}
				<div className="player-overlay-deck">
					<div className="player-overlay-head">
						<Button
							aria-label={labels.close}
							className="player-button-icon player-overlay-close"
							onClick={() => {
								store.getState().setOverlayOpen(false);
							}}
							ref={closeRef}
						>
							<CloseIcon size={16} />
						</Button>
						<TrackInfo className="player-overlay-track" emptyLabel={labels.nowPlaying}>
							<TimeDisplay label={labels.toggleTimeMode} />
						</TrackInfo>
					</div>
					{isPanelOpen ? <WaveformPanelSurface labels={labels} /> : undefined}
					<div className="player-overlay-scrub">
						<SeekBar label={labels.seek} />
						<StatusRegion labels={labels} />
					</div>
					<div className="player-overlay-controls">
						<TransportControls labels={labels} seekSeconds={seekSeconds} />
						{layout === 'columns' ? (
							<>
								<PanelToggle label={labels.waveformPanel} />
								<VolumeControl labels={labels} />
							</>
						) : undefined}
					</div>
					{layout === 'columns' ? (
						<OverlayTabs actions={queueActions} labels={labels} />
					) : (
						<OverlaySheets actions={queueActions} labels={labels} />
					)}
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

function layoutFor(width: number, height: number): OverlayLayout {
	// eslint-disable-next-line unicorn/prefer-number-coercion -- `Number('16px')` is NaN; a computed font size carries its unit
	const remPixels = Number.parseFloat(getComputedStyle(document.documentElement).fontSize);

	return width >= columnsMinWidthRem * remPixels && height >= columnsMinHeightRem * remPixels
		? 'columns'
		: 'phone';
}

// Measured rather than queried in CSS, since the layouts differ in markup: tabs in columns, dialogs on a phone
function useOverlayLayout(ref: RefObject<HTMLElement | null>): OverlayLayout {
	const [layout, setLayout] = useState<OverlayLayout>('columns');

	useLayoutEffect(() => {
		const element = ref.current;
		if (!element) return;

		function measure(): void {
			if (!element) return;

			const { height, width } = element.getBoundingClientRect();
			// A DOM without layout reports zero, and keeps the default
			if (width === 0) return;

			setLayout(layoutFor(width, height));
		}

		measure();

		const observer = new ResizeObserver(measure);

		observer.observe(element);

		return () => {
			observer.disconnect();
		};
	}, [ref]);

	return layout;
}
