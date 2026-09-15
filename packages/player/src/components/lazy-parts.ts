import { createLazyPart } from '#components/create-lazy-part.ts';

// Each part loads on first open, and its toggle's hover or focus starts the request so a pointer open is warm
export const overlayContentPart = createLazyPart(async () => {
	const { OverlayContent } = await import('#components/overlay-content.tsx');

	return OverlayContent;
});

export const queueTrayPanelPart = createLazyPart(async () => {
	const { QueueTrayPanel } = await import('#components/queue-tray.tsx');

	return QueueTrayPanel;
});

export const waveformPanelSurfacePart = createLazyPart(async () => {
	const { WaveformPanelSurface } = await import('#components/waveform-panel-surface.tsx');

	return WaveformPanelSurface;
});
