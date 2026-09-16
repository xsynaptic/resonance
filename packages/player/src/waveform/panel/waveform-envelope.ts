// Buckets are keyed to absolute sample-pair indices; keying them to screen columns re-buckets the same samples every frame and judders

// 8-bit signed samples, so the envelope reaches 128 either side of the centre line
const fullScale = 128;

// Headroom, so a full-scale transient does not touch the panel's edge
const amplitudeMargin = 0.94;

export interface EnvelopePainter {
	paint: (view: EnvelopeView) => void;
}

export interface EnvelopeTheme {
	waveCoreStyle: string;
	waveEdgeStyle: string;
}

export interface EnvelopeView {
	height: number;
	pairsPerSecond: number;
	// Device pixels per second of audio
	pixelsPerSecond: number;
	// Interleaved min and max; empty until the first chunk lands
	samples: Int8Array;
	width: number;
	windowStartSeconds: number;
}

interface Bucketing {
	first: number;
	openingPair: number;
	pairs: number;
	pxPerPair: number;
}

// Holds the scratch buffers and the gradient, which cost more to rebuild each frame than to keep
export function createEnvelopePainter(
	context: CanvasRenderingContext2D,
	theme: EnvelopeTheme,
): EnvelopePainter {
	let minima = new Float32Array(0);
	let maxima = new Float32Array(0);
	let waveFill: CanvasGradient | undefined;
	let waveFillHeight = 0;

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

	function measureBuckets(
		samples: Int8Array,
		{ count, first, pairs }: { count: number; first: number; pairs: number },
	): void {
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

	return {
		paint: (view) => {
			if (view.samples.length === 0) return;

			const { first, openingPair, pairs, pxPerPair } = bucketing(view);
			const count = Math.ceil(view.width / (pairs * pxPerPair)) + 3;
			const centreY = view.height / 2;
			const scale = (centreY * amplitudeMargin) / fullScale;
			const bucketX = (bucket: number): number =>
				((first + bucket) * pairs - openingPair) * pxPerPair;

			measureBuckets(view.samples, { count, first, pairs });

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
		},
	};
}

// A bucket is about one device pixel wide, in whole sample pairs, so its span never shifts between frames
function bucketing({
	pairsPerSecond,
	pixelsPerSecond,
	windowStartSeconds,
}: EnvelopeView): Bucketing {
	const pxPerPair = pixelsPerSecond / pairsPerSecond;
	const pairs = Math.max(1, Math.round(1 / pxPerPair));
	const openingPair = windowStartSeconds * pairsPerSecond;

	return { first: Math.floor(openingPair / pairs) - 1, openingPair, pairs, pxPerPair };
}
