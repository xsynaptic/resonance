import type { QueueCuePoint } from '#types.ts';

// Every length here is a device pixel, never a CSS pixel
// Buckets are keyed to absolute sample-pair indices; keying them to screen columns re-buckets the same samples every frame and judders

// 8-bit signed samples, so the envelope reaches 128 either side of the centre line
const fullScale = 128;

// Headroom, so a full-scale transient does not touch the panel's edge
const amplitudeMargin = 0.94;

const hatchTilePx = 8;

export interface ScrollPainter {
	paint: (view: ScrollView, ratio: number) => void;
}

export interface ScrollTheme {
	boundaryStyle: string;
	edgeStyle: string;
	gridStyle: string;
	voidStyle: string;
	waveCoreStyle: string;
	waveEdgeStyle: string;
}

interface Bucketing {
	first: number;
	openingPair: number;
	pairs: number;
	pxPerPair: number;
}

interface ScrollView {
	cuePoints: ReadonlyArray<QueueCuePoint>;
	// Everything outside zero to here is drawn as null rather than as silence
	durationS: number | undefined;
	height: number;
	pairsPerSecond: number;
	// Device pixels per second of audio
	pixelsPerSecond: number;
	// Interleaved min and max; empty until the first chunk lands
	samples: Int8Array;
	startS: number;
	width: number;
}

// Holds the scratch buffers and paint styles, which cost more to rebuild each frame than to keep
export function createScrollPainter(
	context: CanvasRenderingContext2D,
	theme: ScrollTheme,
): ScrollPainter {
	let minima = new Float32Array(0);
	let maxima = new Float32Array(0);
	let waveFill: CanvasGradient | undefined;
	let waveFillHeight = 0;
	let hatch: CanvasPattern | undefined;
	let hatchRatio = 0;

	function envelopeFill(height: number): CanvasGradient {
		if (waveFill && waveFillHeight === height) return waveFill;

		const gradient = context.createLinearGradient(0, 0, 0, height);

		gradient.addColorStop(0, theme.waveEdgeStyle);
		gradient.addColorStop(0.5, theme.waveCoreStyle);
		gradient.addColorStop(1, theme.waveEdgeStyle);

		waveFill = gradient;
		waveFillHeight = height;

		return gradient;
	}

	function measureBuckets(samples: Int8Array, first: number, pairs: number, count: number): void {
		if (minima.length < count) {
			minima = new Float32Array(count);
			maxima = new Float32Array(count);
		}

		const pairsTotal = samples.length / 2;

		for (let bucket = 0; bucket < count; bucket += 1) {
			const opening = (first + bucket) * pairs;
			// Clamped separately, so a bucket before the start reads as silence rather than as pair zero
			const from = Math.max(0, opening);
			const to = Math.min(pairsTotal, opening + pairs);
			let lowest = 0;
			let highest = 0;

			for (let pair = from; pair < to; pair += 1) {
				const min = samples[pair * 2] ?? 0;
				const max = samples[pair * 2 + 1] ?? 0;

				if (min < lowest) lowest = min;
				if (max > highest) highest = max;
			}

			minima[bucket] = lowest;
			maxima[bucket] = highest;
		}
	}

	function nullHatch(ratio: number): CanvasPattern | undefined {
		if (hatch && hatchRatio === ratio) return hatch;

		hatch = createHatch(theme.voidStyle, ratio);
		hatchRatio = ratio;

		return hatch;
	}

	// The line only; the label rides its boundary in the DOM, where it can carry type and a fade
	function paintBoundaries(view: ScrollView, ratio: number): void {
		const { cuePoints, height, pixelsPerSecond, startS, width } = view;
		if (cuePoints.length === 0) return;

		const endS = startS + width / pixelsPerSecond;

		context.fillStyle = theme.boundaryStyle;

		for (const cue of cuePoints) {
			if (cue.startS > endS) break;

			const openingX = (cue.startS - startS) * pixelsPerSecond;
			if (openingX < 0) continue;

			// Fractional x; a boundary rounded to whole pixels judders the way the envelope would
			context.fillRect(openingX - ratio / 2, 0, ratio, height);
		}
	}

	function paintEnvelope(view: ScrollView): void {
		if (view.samples.length === 0) return;

		const { first, openingPair, pairs, pxPerPair } = bucketing(view);
		const count = Math.ceil(view.width / (pairs * pxPerPair)) + 3;
		const centreY = view.height / 2;
		const scale = (centreY * amplitudeMargin) / fullScale;
		const bucketX = (bucket: number): number =>
			((first + bucket) * pairs - openingPair) * pxPerPair;

		measureBuckets(view.samples, first, pairs, count);

		context.fillStyle = envelopeFill(view.height);
		context.beginPath();
		context.moveTo(bucketX(0), centreY);

		for (let bucket = 0; bucket < count; bucket += 1) {
			context.lineTo(bucketX(bucket), centreY - (maxima[bucket] ?? 0) * scale);
		}

		for (let bucket = count - 1; bucket >= 0; bucket -= 1) {
			context.lineTo(bucketX(bucket), centreY - (minima[bucket] ?? 0) * scale);
		}

		context.closePath();
		context.fill();
	}

	function paintEdges(view: ScrollView, ratio: number): void {
		const { durationS, height, pixelsPerSecond, startS, width } = view;
		if (durationS === undefined) return;

		context.fillStyle = theme.edgeStyle;

		for (const seconds of [0, durationS]) {
			const x = (seconds - startS) * pixelsPerSecond;
			if (x < 0 || x > width) continue;

			context.fillRect(x - ratio / 2, 0, ratio, height);
		}
	}

	// Drawn even before any audio lands, so an opening panel reads as empty rather than as broken
	function paintGrid(view: ScrollView): void {
		context.fillStyle = theme.gridStyle;
		context.fillRect(0, Math.round(view.height / 2), view.width, 1);
	}

	// Outside the mix there is no audio at all, and flat silence would misreport that
	function paintNull(view: ScrollView, ratio: number): void {
		const { durationS, height, pixelsPerSecond, startS, width } = view;
		if (durationS === undefined) return;

		const pattern = nullHatch(ratio);
		if (!pattern) return;

		const openingX = -startS * pixelsPerSecond;
		const closingX = (durationS - startS) * pixelsPerSecond;

		context.fillStyle = pattern;
		if (openingX > 0) context.fillRect(0, 0, Math.min(openingX, width), height);
		if (closingX < width) context.fillRect(closingX, 0, width - closingX, height);
	}

	return {
		paint: (view, ratio) => {
			context.clearRect(0, 0, view.width, view.height);
			paintNull(view, ratio);
			paintGrid(view);
			paintEnvelope(view);
			paintEdges(view, ratio);
			paintBoundaries(view, ratio);
		},
	};
}

// A bucket is about one device pixel wide, in whole sample pairs, so its span never shifts between frames
function bucketing({ pairsPerSecond, pixelsPerSecond, startS }: ScrollView): Bucketing {
	const pxPerPair = pixelsPerSecond / pairsPerSecond;
	const pairs = Math.max(1, Math.round(1 / pxPerPair));
	const openingPair = startS * pairsPerSecond;

	return { first: Math.floor(openingPair / pairs) - 1, openingPair, pairs, pxPerPair };
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
