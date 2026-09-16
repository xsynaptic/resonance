import type { QueueCuePoint } from '#types.ts';
import type { EnvelopeTheme, EnvelopeView } from '#waveform/panel/waveform-envelope.ts';

import { createEnvelopePainter } from '#waveform/panel/waveform-envelope.ts';

// Every length here is a device pixel, never a CSS pixel

const hatchTilePx = 8;

// In CSS pixels, and as a share of half the panel's height
const placeholderWavelengthPx = 48;
const placeholderAmplitude = 0.2;

export interface ScrollPainter {
	paint: (view: ScrollView, ratio: number) => void;
}

export interface ScrollTheme extends EnvelopeTheme {
	cueStyle: string;
	edgeStyle: string;
	gridStyle: string;
	placeholderStyle: string;
}

export interface SecondsSpan {
	fromSeconds: number;
	toSeconds: number;
}

interface PlaceholderGeometry {
	durationSeconds: number | undefined;
	pixelsPerSecond: number;
	width: number;
	windowStartSeconds: number;
}

interface ScrollView extends EnvelopeView {
	cuePoints: ReadonlyArray<QueueCuePoint>;
	// Everything outside zero to here is drawn as null rather than as silence
	durationSeconds: number | undefined;
	// In wavelengths travelled
	placeholderPhase: number;
	placeholders: ReadonlyArray<SecondsSpan>;
}

// Holds the hatch pattern and the envelope painter, which cost more to rebuild each frame than to keep
export function createScrollPainter(
	context: CanvasRenderingContext2D,
	theme: ScrollTheme,
): ScrollPainter {
	const envelope = createEnvelopePainter(context, theme);

	let hatch: CanvasPattern | undefined;
	let hatchRatio = 0;

	function nullHatch(ratio: number): CanvasPattern | undefined {
		if (hatch && hatchRatio === ratio) return hatch;

		hatch = createHatch(theme.gridStyle, ratio);
		hatchRatio = ratio;

		return hatch;
	}

	// The line only; the label rides its boundary in the DOM, where it can carry type and a fade
	function paintBoundaries(view: ScrollView, ratio: number): void {
		const { cuePoints, height, pixelsPerSecond, width, windowStartSeconds } = view;
		if (cuePoints.length === 0) return;

		const windowEndSeconds = windowStartSeconds + width / pixelsPerSecond;

		context.fillStyle = theme.cueStyle;

		for (const cue of cuePoints) {
			if (cue.startSeconds > windowEndSeconds) break;

			const openingX = (cue.startSeconds - windowStartSeconds) * pixelsPerSecond;
			if (openingX < 0) continue;

			// Fractional x; a boundary rounded to whole pixels judders the way the envelope would
			context.fillRect(openingX - ratio / 2, 0, ratio, height);
		}
	}

	function paintEdges(view: ScrollView, ratio: number): void {
		const { durationSeconds, height, pixelsPerSecond, width, windowStartSeconds } = view;
		if (durationSeconds === undefined) return;

		context.fillStyle = theme.edgeStyle;

		for (const seconds of [0, durationSeconds]) {
			const x = (seconds - windowStartSeconds) * pixelsPerSecond;
			if (x < 0 || x > width) continue;

			context.fillRect(x - ratio / 2, 0, ratio, height);
		}
	}

	// Drawn even before any audio lands, so an opening panel reads as empty rather than as broken
	// Stops at the mix's ends: outside them the hatch already says there is nothing to anchor
	function paintGrid(view: ScrollView): void {
		const { durationSeconds, height, pixelsPerSecond, width, windowStartSeconds } = view;
		const openingX =
			durationSeconds === undefined ? 0 : Math.max(0, -windowStartSeconds * pixelsPerSecond);
		const closingX =
			durationSeconds === undefined
				? width
				: Math.min(width, (durationSeconds - windowStartSeconds) * pixelsPerSecond);
		if (closingX <= openingX) return;

		context.fillStyle = theme.gridStyle;
		context.fillRect(openingX, Math.round(height / 2), closingX - openingX, 1);
	}

	// Outside the mix there is no audio at all, and flat silence would misreport that
	function paintNull(view: ScrollView, ratio: number): void {
		const { durationSeconds, height, pixelsPerSecond, width, windowStartSeconds } = view;
		if (durationSeconds === undefined) return;

		const pattern = nullHatch(ratio);
		if (!pattern) return;

		const openingX = -windowStartSeconds * pixelsPerSecond;
		const closingX = (durationSeconds - windowStartSeconds) * pixelsPerSecond;

		context.fillStyle = pattern;
		if (openingX > 0) context.fillRect(0, 0, Math.min(openingX, width), height);
		if (closingX < width) context.fillRect(closingX, 0, width - closingX, height);
	}

	function paintPlaceholders(view: ScrollView, ratio: number): void {
		if (view.placeholders.length === 0) return;

		context.strokeStyle = theme.placeholderStyle;
		context.lineWidth = ratio;
		tracePlaceholders(context, view, ratio);
		context.stroke();
	}

	return {
		paint: (view, ratio) => {
			context.clearRect(0, 0, view.width, view.height);
			paintNull(view, ratio);
			paintGrid(view);
			paintPlaceholders(view, ratio);
			envelope.paint(view);
			paintEdges(view, ratio);
			paintBoundaries(view, ratio);
		},
	};
}

export function placeholderRange(
	{ durationSeconds, pixelsPerSecond, width, windowStartSeconds }: PlaceholderGeometry,
	span: SecondsSpan,
): undefined | { closingX: number; openingX: number } {
	const windowStartX = windowStartSeconds * pixelsPerSecond;
	const openingX = Math.max(0, -windowStartX, span.fromSeconds * pixelsPerSecond - windowStartX);
	const closingX = Math.min(
		width,
		(durationSeconds ?? Infinity) * pixelsPerSecond - windowStartX,
		span.toSeconds * pixelsPerSecond - windowStartX,
	);
	if (closingX <= openingX) return undefined;

	return { closingX, openingX };
}

// The corner strokes are what keep the 45-degree diagonal unbroken where the tiles meet
function createHatch(style: string, ratio: number): CanvasPattern | undefined {
	const size = Math.max(4, Math.round(hatchTilePx * ratio));
	const tile = document.createElement('canvas');

	tile.width = size;
	tile.height = size;

	const tileContext = tile.getContext('2d');
	if (!tileContext) return undefined;

	tileContext.strokeStyle = style;
	tileContext.lineWidth = Math.max(1, Math.round(ratio));
	tileContext.beginPath();
	tileContext.moveTo(0, size);
	tileContext.lineTo(size, 0);
	tileContext.moveTo(-size, size);
	tileContext.lineTo(size, -size);
	tileContext.moveTo(0, size * 2);
	tileContext.lineTo(size * 2, 0);
	tileContext.stroke();

	return tileContext.createPattern(tile, 'repeat') ?? undefined;
}

// Anchored to the timeline rather than the canvas, so it scrolls with the audio it stands in for
function tracePlaceholders(
	context: CanvasRenderingContext2D,
	view: ScrollView,
	ratio: number,
): void {
	const { height, pixelsPerSecond, placeholderPhase, windowStartSeconds } = view;
	const wavelength = placeholderWavelengthPx * ratio;
	const centreY = height / 2;
	const amplitude = centreY * placeholderAmplitude;
	const windowStartX = windowStartSeconds * pixelsPerSecond;
	const waveY = (x: number): number =>
		centreY -
		Math.sin(((x + windowStartX) / wavelength + placeholderPhase) * 2 * Math.PI) * amplitude;

	context.beginPath();

	for (const span of view.placeholders) {
		const range = placeholderRange(view, span);
		if (!range) continue;

		context.moveTo(range.openingX, waveY(range.openingX));

		for (let x = range.openingX + ratio; x < range.closingX; x += ratio) {
			context.lineTo(x, waveY(x));
		}

		context.lineTo(range.closingX, waveY(range.closingX));
	}
}
