import type { QueueCuePoint } from '#types.ts';
import type { WaveformArchive } from '#waveform/waveform-archive.ts';
import type { ScrollTheme } from '#waveform/waveform-scroll.ts';

import { createPanelPlaceholder } from '#waveform/panel-placeholder.ts';
import { createScrollPainter, placeholderRange } from '#waveform/waveform-scroll.ts';

// How much of the panel the arriving boundary must still cross before the parked label starts to go
const cueFadeStart = 0.25;

// Asked for past the window's end, so a slow link lands the next chunk before it scrolls into view rather than as it does
const lookAheadSeconds = 30;

const noSamples = new Int8Array(0);

export interface PanelCanvas {
	fadeFromPx(): number;
	resize(): void;
	scroll(windowStartSeconds: number, durationSeconds: number | undefined, frameMs: number): void;
	// The span the panel shows at its current width, which the playhead sits in the middle of
	windowSeconds(): number;
}

interface PanelCanvasOptions {
	canvas: HTMLCanvasElement;
	context: CanvasRenderingContext2D;
	cuePoints: ReadonlyArray<QueueCuePoint>;
	isArchiveOpening: () => boolean;
	pxPerSecond: number;
	// The archive lands after the first frames, so the painter reads it rather than holding it
	readArchive: () => undefined | WaveformArchive;
}

// Owns the backing store's geometry and the painted frame; everything here is in device pixels
export function createPanelCanvas({
	canvas,
	context,
	cuePoints,
	isArchiveOpening,
	pxPerSecond,
	readArchive,
}: PanelCanvasOptions): PanelCanvas {
	const painter = createScrollPainter(context, readScrollTheme(canvas));
	const placeholder = createPanelPlaceholder();

	// Measured on resize; reading these per frame would force a layout every frame
	let ratio = 1;
	let width = 0;
	let height = 0;
	let windowSeconds = 0;
	let pixelsPerSecond = 0;
	let fadeFromPx = 0;

	let paintedWindowStartSeconds = NaN;
	let paintedChunks = -1;
	let paintedPlaceholders = '';

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

			windowSeconds = cssWidth / pxPerSecond;
			pixelsPerSecond = width / windowSeconds;
			fadeFromPx = cssWidth * cueFadeStart;
			paintedWindowStartSeconds = NaN;
		},

		scroll(windowStartSeconds, durationSeconds, frameMs) {
			const loaded = readArchive();
			const pairsPerSecond = loaded?.pairsPerSecond ?? 0;
			const fromPair = Math.floor(windowStartSeconds * pairsPerSecond);
			const toPair = Math.ceil((windowStartSeconds + windowSeconds) * pairsPerSecond);
			const landedChunks = requestSpan(
				loaded,
				fromPair,
				toPair + Math.ceil(lookAheadSeconds * pairsPerSecond),
			);
			const geometry = { durationSeconds, pixelsPerSecond, width, windowStartSeconds };
			const pending = placeholder.frame({
				archive: loaded,
				frameMs,
				fromPair,
				isArchiveOpening: isArchiveOpening(),
				isDrawn: (span) => placeholderRange(geometry, span) !== undefined,
				toPair,
				windowSpan: {
					fromSeconds: windowStartSeconds,
					toSeconds: windowStartSeconds + windowSeconds,
				},
			});

			// Sub-pixel geometry, so the only frame worth skipping is one where nothing moved, landed or travelled
			if (
				windowStartSeconds === paintedWindowStartSeconds &&
				landedChunks === paintedChunks &&
				pending.repaintKey === paintedPlaceholders
			)
				return;

			paintedWindowStartSeconds = windowStartSeconds;
			paintedChunks = landedChunks;
			paintedPlaceholders = pending.repaintKey;

			painter.paint(
				{
					cuePoints,
					durationSeconds,
					height,
					pairsPerSecond,
					pixelsPerSecond,
					placeholderPhase: pending.phase,
					placeholders: pending.spans,
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
		cueStyle: styles.getPropertyValue('--player-panel-cue'),
		edgeStyle: styles.getPropertyValue('--player-panel-ends'),
		gridStyle: styles.getPropertyValue('--player-panel-grid'),
		placeholderStyle: styles.getPropertyValue('--player-panel-placeholder'),
		waveCoreStyle: styles.getPropertyValue('--player-panel-wave'),
		waveEdgeStyle: styles.getPropertyValue('--player-panel-wave-peak'),
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
