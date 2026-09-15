import type { PanelLabels } from '#components/waveform-panel-surface.tsx';

import { waveformPanelSurfacePart } from '#components/lazy-parts.ts';
import { usePlayer, usePlayerStoreApi } from '#store/context.tsx';

// Closed renders nothing: a shut panel costs no canvas, no subscription and no requests
export function WaveformPanel({ labels }: { labels: PanelLabels }) {
	const isOpen = usePlayer((state) => state.isPanelOpen && !state.isOverlayOpen);
	const store = usePlayerStoreApi();

	if (!isOpen) return;

	return (
		<waveformPanelSurfacePart.Component
			fallback={<div aria-hidden="true" className="player-panel" />}
			labels={labels}
			onFailed={() => {
				store.getState().setPanelOpen(false);
			}}
		/>
	);
}
