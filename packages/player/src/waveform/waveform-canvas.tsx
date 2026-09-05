import type { KeyboardEvent, PointerEvent } from 'react';

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';

import type { PlayerUrls, SubscribeTime } from '#types.ts';

import { joinClassNames } from '#lib/class-names.ts';
import { formatClock } from '#lib/format.ts';
import { resamplePeaks } from '#waveform/resample.ts';
import { getThemeVersion, subscribeTheme } from '#waveform/theme-version.ts';
import { loadWaveform } from '#waveform/waveform-cache.ts';

const targetBuckets = 400;

// Coarse for a mix that runs hours, but the steps a slider is expected to answer to
const arrowStepSeconds = 5;
const pageStepSeconds = 60;

const keyStepsSeconds = new Map<string, number>([
	['ArrowDown', -arrowStepSeconds],
	['ArrowLeft', -arrowStepSeconds],
	['ArrowRight', arrowStepSeconds],
	['ArrowUp', arrowStepSeconds],
	['PageDown', -pageStepSeconds],
	['PageUp', pageStepSeconds],
]);

interface BarLayout {
	bar: number;
	height: number;
	pitch: number;
	radius: number;
}

interface HiResPeaks {
	peaks: ReadonlyArray<number>;
	trackId: string;
}

interface WaveformCanvasProps {
	className?: string | undefined;
	durationS: number | undefined;
	label: string;
	onSeek: (seconds: number) => void;
	overview: ReadonlyArray<number>;
	resolveWaveform: PlayerUrls['waveform'];
	subscribeTime: SubscribeTime;
	trackId: string;
}

interface WaveformRendering {
	height: number;
	path: Path2D;
	playedStyle: string;
	trackStyle: string;
	width: number;
}

// Draws the inline overview until the full-resolution waveform lands
export function WaveformCanvas({
	className,
	durationS,
	label,
	onSeek,
	overview,
	resolveWaveform,
	subscribeTime,
	trackId,
}: WaveformCanvasProps) {
	const canvasRef = useRef<HTMLCanvasElement>(null);

	// The handlers seek from the position the last paint saw, which is fresher than any render
	const currentTimeRef = useRef(0);

	// Tagged with its track so a stale fetch never paints over the current one
	const [hiRes, setHiRes] = useState<HiResPeaks | undefined>(undefined);

	const themeVersion = useSyncExternalStore(subscribeTheme, getThemeVersion, zeroVersion);

	useEffect(() => {
		let isCancelled = false;

		// The fetch is shared and finishes either way; a late answer for another track is dropped here
		void loadWaveform(resolveWaveform, trackId, targetBuckets).then((loaded) => {
			if (!isCancelled && loaded) setHiRes({ peaks: loaded, trackId });
		});

		return () => {
			isCancelled = true;
		};
	}, [resolveWaveform, trackId]);

	const peaks = hiRes?.trackId === trackId ? hiRes.peaks : overview;

	useEffect(() => {
		const canvas = canvasRef.current;
		const context = canvas?.getContext('2d');
		if (!canvas || !context) return;

		let rendering: undefined | WaveformRendering;
		let paintedPx = -1;
		let announced = '';

		const paint = (currentTimeS: number): void => {
			currentTimeRef.current = currentTimeS;

			if (rendering === undefined) {
				rendering = prepareRendering(canvas, peaks);
				if (rendering === undefined) return;

				// Assigning either resets the backing store, so it happens with the rebuild rather than per tick
				canvas.width = rendering.width;
				canvas.height = rendering.height;
				paintedPx = -1;
			}

			const progress = durationS && durationS > 0 ? Math.min(1, currentTimeS / durationS) : 0;
			const playedPx = Math.round(progress * rendering.width);

			// On an hour-long mix a tick moves the edge a fraction of a device pixel, and repainting draws the same image
			if (playedPx !== paintedPx) {
				paintedPx = playedPx;
				paintWaveform(context, rendering, playedPx);
			}

			const clock = formatClock(currentTimeS);
			if (clock === announced) return;

			announced = clock;
			canvas.setAttribute('aria-valuenow', String(Math.floor(currentTimeS)));
			canvas.setAttribute('aria-valuetext', clock);
		};

		const observer = new ResizeObserver(() => {
			rendering = undefined;
			paint(currentTimeRef.current);
		});

		observer.observe(canvas);

		const unsubscribe = subscribeTime(paint);

		return () => {
			observer.disconnect();
			unsubscribe();
		};
	}, [durationS, peaks, subscribeTime, themeVersion]);

	function seekToPointer(event: PointerEvent<HTMLCanvasElement>): void {
		if (durationS === undefined) return;

		const rect = event.currentTarget.getBoundingClientRect();
		const ratio = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));

		onSeek(ratio * durationS);
	}

	function seekToKey(event: KeyboardEvent<HTMLCanvasElement>): void {
		if (durationS === undefined) return;

		const target = keyTarget(event.key, currentTimeRef.current, durationS);
		if (target === undefined) return;

		event.preventDefault();
		onSeek(Math.min(durationS, Math.max(0, target)));
	}

	return (
		<canvas
			aria-label={label}
			aria-valuemax={durationS ?? 0}
			aria-valuemin={0}
			className={joinClassNames('player-waveform', className)}
			onKeyDown={seekToKey}
			onPointerDown={(event) => {
				event.currentTarget.setPointerCapture(event.pointerId);
				seekToPointer(event);
			}}
			onPointerMove={(event) => {
				if (event.buttons === 1) seekToPointer(event);
			}}
			ref={canvasRef}
			role="slider"
			tabIndex={0}
		/>
	);
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

// The keys `role="slider"` contracts for; anything else falls through to the page
function keyTarget(key: string, currentTimeS: number, durationS: number): number | undefined {
	if (key === 'Home') return 0;
	if (key === 'End') return durationS;

	const step = keyStepsSeconds.get(key);

	return step === undefined ? undefined : currentTimeS + step;
}

function paintWaveform(
	context: CanvasRenderingContext2D,
	{ height, path, playedStyle, trackStyle, width }: WaveformRendering,
	playedPx: number,
): void {
	context.clearRect(0, 0, width, height);
	context.fillStyle = trackStyle;
	context.fill(path);

	if (playedPx <= 0) return;

	// A clip rather than a colour per bar, so the played edge lands mid-bar instead of jumping a whole one
	context.save();
	context.beginPath();
	context.rect(0, 0, playedPx, height);
	context.clip();
	context.fillStyle = playedStyle;
	context.fill(path);
	context.restore();
}

// Every length is in device pixels: a bar pitch that is not a whole number of them aliases each bar differently
function prepareRendering(
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
		playedStyle: styles.getPropertyValue('--player-accent'),
		trackStyle: styles.getPropertyValue('--player-waveform-track'),
		width,
	};
}

// The token has to resolve to a px length: a custom property cannot be converted from any other unit without a probe element
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

function zeroVersion(): number {
	return 0;
}
