import type { KeyboardEvent, PointerEvent } from 'react';

import { useEffect, useRef, useState } from 'react';

import type { PlayerUrls } from '#types.ts';

import { joinClassNames } from '#lib/class-names.ts';
import { formatClock } from '#lib/format.ts';
import { resamplePeaks } from '#waveform/resample.ts';
import { loadWaveform } from '#waveform/waveform-cache.ts';

const TARGET_BUCKETS = 400;

// Coarse for a mix that runs hours, but the steps a slider is expected to answer to
const ARROW_STEP_S = 5;
const PAGE_STEP_S = 60;

const KEY_STEPS_S = new Map<string, number>([
	['ArrowDown', -ARROW_STEP_S],
	['ArrowLeft', -ARROW_STEP_S],
	['ArrowRight', ARROW_STEP_S],
	['ArrowUp', ARROW_STEP_S],
	['PageDown', -PAGE_STEP_S],
	['PageUp', PAGE_STEP_S],
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
	currentTimeS: number;
	durationS: number | undefined;
	label: string;
	onSeek: (seconds: number) => void;
	overview: ReadonlyArray<number>;
	resolveWaveform: PlayerUrls['waveform'];
	trackId: string;
}

// Draws the inline overview until the full-resolution waveform lands
export function WaveformCanvas({
	className,
	currentTimeS,
	durationS,
	label,
	onSeek,
	overview,
	resolveWaveform,
	trackId,
}: WaveformCanvasProps) {
	const canvasRef = useRef<HTMLCanvasElement>(null);

	// Tagged with its track so a stale fetch never paints over the current one
	const [hiRes, setHiRes] = useState<HiResPeaks | undefined>(undefined);

	// A canvas resolves custom properties only when something draws, so a host retint has to arrive as a redraw
	const [themeVersion, setThemeVersion] = useState(0);

	useEffect(() => {
		const controller = new AbortController();

		void loadWaveform(resolveWaveform, trackId, TARGET_BUCKETS, controller.signal).then(
			(loaded) => {
				if (loaded) setHiRes({ peaks: loaded, trackId });
			},
		);

		return () => {
			controller.abort();
		};
	}, [resolveWaveform, trackId]);

	useEffect(() => {
		const observer = new MutationObserver(() => {
			setThemeVersion((version) => version + 1);
		});

		observer.observe(document.documentElement, { attributeFilter: ['data-theme'] });

		return () => {
			observer.disconnect();
		};
	}, []);

	const peaks = hiRes?.trackId === trackId ? hiRes.peaks : overview;
	const progress = durationS && durationS > 0 ? Math.min(1, currentTimeS / durationS) : 0;

	// Held in a ref so the observer below can stay mounted across every clock tick
	const drawRef = useRef<() => void>(noDraw);

	useEffect(() => {
		drawRef.current = () => {
			const canvas = canvasRef.current;
			if (canvas) draw(canvas, peaks, progress);
		};
		drawRef.current();
	}, [peaks, progress, themeVersion]);

	useEffect(() => {
		const canvas = canvasRef.current;
		if (!canvas) return;

		const observer = new ResizeObserver(() => {
			drawRef.current();
		});

		observer.observe(canvas);

		return () => {
			observer.disconnect();
		};
	}, []);

	function seekToPointer(event: PointerEvent<HTMLCanvasElement>): void {
		if (durationS === undefined) return;

		const rect = event.currentTarget.getBoundingClientRect();
		const ratio = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));

		onSeek(ratio * durationS);
	}

	function seekToKey(event: KeyboardEvent<HTMLCanvasElement>): void {
		if (durationS === undefined) return;

		const target = keyTarget(event.key, currentTimeS, durationS);
		if (target === undefined) return;

		event.preventDefault();
		onSeek(Math.min(durationS, Math.max(0, target)));
	}

	return (
		<canvas
			aria-label={label}
			aria-valuemax={durationS ?? 0}
			aria-valuemin={0}
			aria-valuenow={currentTimeS}
			aria-valuetext={formatClock(currentTimeS)}
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

function clipToProgress(
	context: CanvasRenderingContext2D,
	width: number,
	height: number,
	progress: number,
	paint: () => void,
): void {
	const played = progress * width;
	if (played <= 0) return;

	context.save();
	context.beginPath();
	context.rect(0, 0, played, height);
	context.clip();
	paint();
	context.restore();
}

// Every length is in device pixels: a bar pitch that is not a whole number of them aliases each bar differently
function draw(canvas: HTMLCanvasElement, peaks: ReadonlyArray<number>, progress: number): void {
	const context = canvas.getContext('2d');
	if (!context || peaks.length === 0) return;

	const ratio = window.devicePixelRatio || 1;
	const width = Math.max(1, Math.round(canvas.clientWidth * ratio));
	const height = Math.max(1, Math.round(canvas.clientHeight * ratio));

	canvas.width = width;
	canvas.height = height;
	context.clearRect(0, 0, width, height);

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

	const path = barsPath(bars, layout);

	context.fillStyle = styles.getPropertyValue('--player-waveform-track');
	context.fill(path);

	// A clip rather than a colour per bar, so the played edge lands mid-bar instead of jumping a whole one
	clipToProgress(context, width, height, progress, () => {
		context.fillStyle = styles.getPropertyValue('--player-accent');
		context.fill(path);
	});
}

// The keys `role="slider"` contracts for; anything else falls through to the page
function keyTarget(key: string, currentTimeS: number, durationS: number): number | undefined {
	if (key === 'Home') return 0;
	if (key === 'End') return durationS;

	const step = KEY_STEPS_S.get(key);

	return step === undefined ? undefined : currentTimeS + step;
}

function noDraw(): void {
	return;
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
