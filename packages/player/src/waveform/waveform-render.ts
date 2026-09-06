import { resamplePeaks } from '#waveform/resample.ts';

export interface WaveformRendering {
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

export function paintWaveform(
	context: CanvasRenderingContext2D,
	{ height, path, playedStyle, trackStyle, width }: WaveformRendering,
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

	const ratio = window.devicePixelRatio || 1;
	const width = Math.max(1, Math.round(canvas.clientWidth * ratio));
	const height = Math.max(1, Math.round(canvas.clientHeight * ratio));

	const styles = getComputedStyle(canvas);
	const bar = Math.max(1, readDevicePixels(styles, '--player-waveform-bar', ratio, 2));
	const gap = readDevicePixels(styles, '--player-waveform-gap', ratio, 1);
	const pitch = bar + gap;
	const layout = {
		bar,
		height,
		pitch,
		radius: readDevicePixels(styles, '--player-waveform-radius', ratio, 0),
	} satisfies BarLayout;

	// The trailing gap is not drawn, so one more bar fits than the pitch alone allows
	const bars = resamplePeaks(peaks, Math.max(1, Math.floor((width + gap) / pitch)));

	return {
		height,
		path: barsPath(bars, layout),
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
function readDevicePixels(
	styles: CSSStyleDeclaration,
	property: string,
	ratio: number,
	fallback: number,
): number {
	// eslint-disable-next-line unicorn/prefer-number-coercion -- `Number('2px')` is NaN; the token carries its unit
	const parsed = Number.parseFloat(styles.getPropertyValue(property));

	return Math.max(0, Math.round((Number.isFinite(parsed) ? parsed : fallback) * ratio));
}
