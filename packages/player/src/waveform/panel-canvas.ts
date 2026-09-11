import type { QueueCuePoint } from '#types.ts';
import type { WaveformArchive } from '#waveform/waveform-archive.ts';
import type { ScrollTheme } from '#waveform/waveform-scroll.ts';

import { createScrollPainter } from '#waveform/waveform-scroll.ts';

// A fixed density rather than a fixed span: below about 70 CSS px per second the envelope collapses into a band
export const cssPerSecond = 70;

// How much of the panel the arriving boundary must still cross before the parked label starts to go
const cueFadeStart = 0.25;

const noSamples = new Int8Array(0);

export interface PanelCanvas {
	fadeFromPx(): number;
	resize(): void;
	scroll(windowStartSeconds: number, durationSeconds: number | undefined): void;
	// The span the panel shows at its current width, which the playhead sits in the middle of
	windowSeconds(): number;
}

interface PanelCanvasOptions {
	canvas: HTMLCanvasElement;
	context: CanvasRenderingContext2D;
	cuePoints: ReadonlyArray<QueueCuePoint>;
	// The archive lands after the first frames, so the painter reads it rather than holding it
	readArchive: () => undefined | WaveformArchive;
}

// Owns the backing store's geometry and the painted frame; everything here is in device pixels
export function createPanelCanvas({
	canvas,
	context,
	cuePoints,
	readArchive,
}: PanelCanvasOptions): PanelCanvas {
	const painter = createScrollPainter(context, readScrollTheme(canvas));

	// Measured on resize; reading these per frame would force a layout every frame
	let ratio = 1;
	let width = 0;
	let height = 0;
	let windowSeconds = 0;
	let pixelsPerSecond = 0;
	let fadeFromPx = 0;

	let paintedWindowStartSeconds = NaN;
	let paintedChunks = -1;

	return {
		fadeFromPx: () => fadeFromPx,

		// Reassigning width resets the backing store, so size first and let the next frame paint
		resize() {
			ratio = window.devicePixelRatio || 1;
			width = Math.max(1, Math.round(canvas.clientWidth * ratio));
			height = Math.max(1, Math.round(canvas.clientHeight * ratio));
			canvas.width = width;
			canvas.height = height;

			const cssWidth = Math.max(1, canvas.clientWidth);

			windowSeconds = cssWidth / cssPerSecond;
			pixelsPerSecond = width / windowSeconds;
			fadeFromPx = cssWidth * cueFadeStart;
			paintedWindowStartSeconds = NaN;
		},

		scroll(windowStartSeconds, durationSeconds) {
			const loaded = readArchive();
			const pairsPerSecond = loaded?.pairsPerSecond ?? 0;
			const landedChunks = requestSpan(
				loaded,
				Math.floor(windowStartSeconds * pairsPerSecond),
				Math.ceil((windowStartSeconds + windowSeconds) * pairsPerSecond),
			);

			// Sub-pixel geometry, so the only frame worth skipping is one where nothing moved and nothing landed
			if (windowStartSeconds === paintedWindowStartSeconds && landedChunks === paintedChunks)
				return;

			paintedWindowStartSeconds = windowStartSeconds;
			paintedChunks = landedChunks;

			painter.paint(
				{
					cuePoints,
					durationSeconds,
					height,
					pairsPerSecond,
					pixelsPerSecond,
					samples: loaded?.samples ?? noSamples,
					width,
					windowStartSeconds,
				},
				ratio,
			);
		},

		windowSeconds: () => windowSeconds,
	};
}

// Read once per mount; `getPropertyValue` forces a style recalc and the loop runs every frame
function readScrollTheme(canvas: HTMLCanvasElement): ScrollTheme {
	const styles = getComputedStyle(canvas);

	return {
		boundaryStyle: styles.getPropertyValue('--player-text-bright'),
		edgeStyle: styles.getPropertyValue('--player-panel-edge'),
		gridStyle: styles.getPropertyValue('--player-border'),
		voidStyle: styles.getPropertyValue('--player-panel-void'),
		waveCoreStyle: styles.getPropertyValue('--player-panel-wave'),
		waveEdgeStyle: styles.getPropertyValue('--player-panel-wave-edge'),
	};
}

// A window is one or two chunks, and asking again for one the loader already has costs nothing
function requestSpan(
	archive: undefined | WaveformArchive,
	fromPair: number,
	toPair: number,
): number {
	if (!archive) return 0;

	archive.want(fromPair, toPair);

	return archive.landedChunks();
}
