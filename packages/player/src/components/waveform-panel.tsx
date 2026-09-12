import type { RefObject } from 'react';

import { useRef } from 'react';

import type { PlayerLabels } from '#types.ts';

import { Button } from '#components/button.tsx';
import { ZoomInIcon, ZoomOutIcon } from '#components/icons.tsx';
import { usePlayer, usePlayerStoreApi } from '#store/context.tsx';
import { stepPanelZoom } from '#waveform/panel-zoom.ts';
import { useScrollPanel } from '#waveform/use-scroll-panel.ts';

type PanelLabels = Pick<PlayerLabels, 'timestampsPartial' | 'waveformPanel' | 'zoomIn' | 'zoomOut'>;

// Closed renders nothing: a shut panel costs no canvas, no subscription and no requests
export function WaveformPanel({ labels }: { labels: PanelLabels }) {
	const isOpen = usePlayer((state) => state.isPanelOpen);

	if (!isOpen) return;

	return <WaveformPanelSurface labels={labels} />;
}

// The arriving label is hidden from assistive tech: it names a track that is not playing yet
function CueReadout({
	isAhead,
	note,
	ref,
}: {
	isAhead: boolean;
	note: string;
	ref: RefObject<HTMLParagraphElement | null>;
}) {
	return (
		<p
			aria-hidden={isAhead ? 'true' : undefined}
			className="player-panel-now"
			data-empty=""
			ref={ref}
		>
			<span className="player-panel-now-artist" />
			<span className="player-panel-now-title" />
			<span className="player-panel-now-note">{note}</span>
		</p>
	);
}

function PanelZoom({ labels }: { labels: Pick<PanelLabels, 'zoomIn' | 'zoomOut'> }) {
	const pxPerSecond = usePlayer((state) => state.panelPxPerSecond);
	const store = usePlayerStoreApi();

	return (
		<div className="player-panel-zoom" data-panel-control="">
			<Button
				aria-label={labels.zoomOut}
				className="player-button-small"
				disabled={stepPanelZoom(pxPerSecond, -1) === pxPerSecond}
				onClick={() => {
					store.getState().zoomPanel(-1);
				}}
			>
				<ZoomOutIcon />
			</Button>
			<Button
				aria-label={labels.zoomIn}
				className="player-button-small"
				disabled={stepPanelZoom(pxPerSecond, 1) === pxPerSecond}
				onClick={() => {
					store.getState().zoomPanel(1);
				}}
			>
				<ZoomInIcon />
			</Button>
		</div>
	);
}

function WaveformPanelSurface({ labels }: { labels: PanelLabels }) {
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const panelRef = useRef<HTMLDivElement>(null);
	const parkedRef = useRef<HTMLParagraphElement>(null);
	const arrivingRef = useRef<HTMLParagraphElement>(null);

	useScrollPanel({
		arriving: arrivingRef,
		canvas: canvasRef,
		panel: panelRef,
		parked: parkedRef,
	});

	return (
		<div aria-label={labels.waveformPanel} className="player-panel" ref={panelRef} role="group">
			<canvas aria-hidden="true" className="player-panel-canvas" ref={canvasRef} />
			<div aria-hidden="true" className="player-panel-playhead" />
			<div aria-hidden="true" className="player-panel-ghost" hidden={true} />
			<PanelZoom labels={labels} />
			<div className="player-panel-readout">
				<CueReadout isAhead={false} note={labels.timestampsPartial} ref={parkedRef} />
				<CueReadout isAhead={true} note={labels.timestampsPartial} ref={arrivingRef} />
			</div>
		</div>
	);
}
