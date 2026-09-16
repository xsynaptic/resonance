import type { QueueCuePoint } from '#types.ts';
import type { BarGrid, PlacedCuePoint } from '#waveform/cue-points.ts';

import { readPxProperty } from '#lib/read-px-property.ts';
import { layoutCuePoints } from '#waveform/cue-points.ts';
import { resamplePeaks } from '#waveform/overview/resample.ts';

export interface OverviewCues {
	cueDurationSeconds: number | undefined;
	cuePoints: ReadonlyArray<QueueCuePoint> | undefined;
}

export interface WaveformEdges {
	// Every range the element holds, not the furthest end alone
	buffered?: ReadonlyArray<WaveformSpan> | undefined;
	playedPx: number;
	scrubPx?: number | undefined;
}

export interface WaveformRendering {
	baseStyle: string;
	bufferedStyle: string;
	context: CanvasRenderingContext2D;
	cuePoints: ReadonlyArray<PlacedCuePoint>;
	cuePointSize: number;
	cuePointsPath: Path2D | undefined;
	cuePointStyle: string;
	height: number;
	path: Path2D;
	playedStyle: string;
	ratio: number;
	ringStyle: string;
	ringWidth: number;
	scrubStyle: string;
	width: number;
}

export interface WaveformSpan {
	fromPx: number;
	toPx: number;
}

interface BarLayout {
	bar: number;
	height: number;
	pitch: number;
	radius: number;
}

export function paintWaveform(rendering: WaveformRendering, edges: WaveformEdges): void {
	const { baseStyle, bufferedStyle, context, height, path, playedStyle, scrubStyle, width } =
		rendering;
	const { buffered = [], playedPx, scrubPx } = edges;

	context.clearRect(0, 0, width, height);
	context.fillStyle = baseStyle;
	context.fill(path);

	// Under the played span, so a range the playhead has already crossed reads as played
	for (const { fromPx, toPx } of buffered) {
		fillSpan(rendering, { fromPx, style: bufferedStyle, toPx });
	}

	if (playedPx > 0) fillSpan(rendering, { fromPx: 0, style: playedStyle, toPx: playedPx });

	if (scrubPx !== undefined && scrubPx !== playedPx) {
		fillSpan(rendering, {
			fromPx: Math.min(playedPx, scrubPx),
			style: scrubStyle,
			toPx: Math.max(playedPx, scrubPx),
		});
	}

	paintCuePoints(rendering);
}

// Every length is in device pixels; a fractional bar pitch aliases each bar differently
export function prepareRendering(
	canvas: HTMLCanvasElement,
	peaks: ReadonlyArray<number>,
	cues?: OverviewCues,
): undefined | WaveformRendering {
	if (peaks.length === 0) return undefined;

	const context = canvas.getContext('2d');

	if (!context) return undefined;

	const styles = getComputedStyle(canvas);
	const grid = measureBarGrid(canvas, styles);
	const { bar, count, pitch, ratio, width } = grid;
	const readDevicePixels = createDevicePixelReader(styles, ratio);
	const height = Math.max(1, Math.round(canvas.clientHeight * ratio));
	const layout = {
		bar,
		height,
		pitch,
		radius: readDevicePixels('--player-waveform-radius', 0),
	} satisfies BarLayout;
	const cuePointSize = Math.max(1, readDevicePixels('--player-cue-size', 4));
	const cuePoints =
		cues?.cuePoints === undefined || !cues.cueDurationSeconds || cues.cueDurationSeconds <= 0
			? []
			: layoutCuePoints(cues.cuePoints, cues.cueDurationSeconds, { ...grid, size: cuePointSize });

	// Assigning either resets the backing store, so it happens with the rebuild rather than per tick
	canvas.width = width;
	canvas.height = height;

	return {
		baseStyle: styles.getPropertyValue('--player-waveform-base'),
		bufferedStyle: styles.getPropertyValue('--player-waveform-buffered'),
		context,
		cuePoints,
		cuePointSize,
		cuePointsPath: cuePoints.length === 0 ? undefined : cuePointsPath(cuePoints, cuePointSize / 2),
		cuePointStyle: styles.getPropertyValue('--player-cue-dot'),
		height,
		path: barsPath(resamplePeaks(peaks, count), layout),
		playedStyle: styles.getPropertyValue('--player-waveform-played'),
		ratio,
		ringStyle: styles.getPropertyValue('--player-surface'),
		ringWidth: Math.max(1, Math.round(ratio)),
		scrubStyle: styles.getPropertyValue('--player-waveform-scrub'),
		width,
	};
}

function barsPath(bars: ReadonlyArray<number>, { bar, height, pitch, radius }: BarLayout): Path2D {
	const path = new Path2D();

	for (const [index, peak] of bars.entries()) {
		const barHeight = Math.max(1, Math.round(peak * height));
		const x = index * pitch;
		const y = Math.round((height - barHeight) / 2);

		if (radius > 0) path.roundRect(x, y, bar, barHeight, radius);
		else path.rect(x, y, bar, barHeight);
	}

	return path;
}

function createDevicePixelReader(styles: CSSStyleDeclaration, ratio: number) {
	return (property: string, fallback: number): number =>
		Math.max(0, Math.round(readPxProperty(styles, property, fallback) * ratio));
}

function cuePointsPath(cuePoints: ReadonlyArray<PlacedCuePoint>, radius: number): Path2D {
	const path = new Path2D();

	for (const { x, y } of cuePoints) {
		path.moveTo(x + radius, y);
		path.arc(x, y, radius, 0, Math.PI * 2);
	}

	return path;
}

// Clipped rather than coloured per bar, so an edge can land mid-bar
function fillSpan(
	{ context, height, path }: WaveformRendering,
	{ fromPx, style, toPx }: { fromPx: number; style: string; toPx: number },
): void {
	context.save();
	context.beginPath();
	context.rect(fromPx, 0, toPx - fromPx, height);
	context.clip();
	context.fillStyle = style;
	context.fill(path);
	context.restore();
}

function measureBarGrid(element: HTMLElement, styles: CSSStyleDeclaration): BarGrid {
	const ratio = window.devicePixelRatio || 1;
	const width = Math.max(1, Math.round(element.clientWidth * ratio));
	const readDevicePixels = createDevicePixelReader(styles, ratio);
	const bar = Math.max(1, readDevicePixels('--player-waveform-bar', 2));
	const gap = readDevicePixels('--player-waveform-gap', 1);
	const pitch = bar + gap;

	// The trailing gap is not drawn, so one more bar fits than the pitch alone allows
	return { bar, count: Math.max(1, Math.floor((width + gap) / pitch)), pitch, ratio, width };
}

// The fill covers the stroke's inner half, leaving a ring of surface around each cue point
function paintCuePoints({
	context,
	cuePointsPath,
	cuePointStyle,
	ringStyle,
	ringWidth,
}: WaveformRendering): void {
	if (cuePointsPath === undefined) return;

	context.lineWidth = ringWidth * 2;
	context.strokeStyle = ringStyle;
	context.stroke(cuePointsPath);
	context.fillStyle = cuePointStyle;
	context.fill(cuePointsPath);
}
