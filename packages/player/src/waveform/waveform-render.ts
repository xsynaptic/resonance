import { resamplePeaks } from '#waveform/resample.ts';

export interface BarGrid {
	bar: number;
	count: number;
	pitch: number;
	ratio: number;
	width: number;
}

export interface WaveformRendering {
	context: CanvasRenderingContext2D;
	height: number;
	path: Path2D;
	playedStyle: string;
	trackStyle: string;
	width: number;
}

interface BarLayout {
	bar: number;
	height: number;
	pitch: number;
	radius: number;
}

// The columns the bars land on, in device pixels; anything laid over the waveform reads the same grid
export function measureBarGrid(
	element: HTMLElement,
	styles: CSSStyleDeclaration = getComputedStyle(element),
): BarGrid {
	const ratio = window.devicePixelRatio || 1;
	const width = Math.max(1, Math.round(element.clientWidth * ratio));
	const readDevicePixels = createDevicePixelReader(styles, ratio);
	const bar = Math.max(1, readDevicePixels('--player-waveform-bar', 2));
	const gap = readDevicePixels('--player-waveform-gap', 1);
	const pitch = bar + gap;

	// The trailing gap is not drawn, so one more bar fits than the pitch alone allows
	return { bar, count: Math.max(1, Math.floor((width + gap) / pitch)), pitch, ratio, width };
}

export function paintWaveform(
	{ context, height, path, playedStyle, trackStyle, width }: WaveformRendering,
	playedPx: number,
): void {
	context.clearRect(0, 0, width, height);
	context.fillStyle = trackStyle;
	context.fill(path);

	if (playedPx <= 0) return;

	// Clipped rather than coloured per bar, so the played edge can land mid-bar
	context.save();
	context.beginPath();
	context.rect(0, 0, playedPx, height);
	context.clip();
	context.fillStyle = playedStyle;
	context.fill(path);
	context.restore();
}

// Every length is in device pixels; a fractional bar pitch aliases each bar differently
export function prepareRendering(
	canvas: HTMLCanvasElement,
	peaks: ReadonlyArray<number>,
): undefined | WaveformRendering {
	if (peaks.length === 0) return undefined;

	const context = canvas.getContext('2d');

	if (!context) return undefined;

	const styles = getComputedStyle(canvas);
	const { bar, count, pitch, ratio, width } = measureBarGrid(canvas, styles);
	const height = Math.max(1, Math.round(canvas.clientHeight * ratio));
	const layout = {
		bar,
		height,
		pitch,
		radius: createDevicePixelReader(styles, ratio)('--player-waveform-radius', 0),
	} satisfies BarLayout;

	return {
		context,
		height,
		path: barsPath(resamplePeaks(peaks, count), layout),
		playedStyle: styles.getPropertyValue('--player-waveform-played'),
		trackStyle: styles.getPropertyValue('--player-waveform-track'),
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

// The token has to be a px length; converting any other unit needs a probe element
function createDevicePixelReader(styles: CSSStyleDeclaration, ratio: number) {
	return (property: string, fallback: number): number => {
		// eslint-disable-next-line unicorn/prefer-number-coercion -- `Number('2px')` is NaN; the token carries its unit
		const parsed = Number.parseFloat(styles.getPropertyValue(property));

		return Math.max(0, Math.round((Number.isFinite(parsed) ? parsed : fallback) * ratio));
	};
}
