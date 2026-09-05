import type { KeyboardEvent, PointerEvent } from 'react';

import { useEffect, useRef, useState } from 'react';

import type { PlayerUrls } from '#types.ts';

import { joinClassNames } from '#lib/class-names.ts';
import { formatClock } from '#lib/format.ts';
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

	useEffect(() => {
		const canvas = canvasRef.current;
		if (canvas) draw(canvas, peaks, progress);
	}, [peaks, progress, themeVersion]);

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

function draw(canvas: HTMLCanvasElement, peaks: ReadonlyArray<number>, progress: number): void {
	const context = canvas.getContext('2d');
	if (!context || peaks.length === 0) return;

	const ratio = window.devicePixelRatio || 1;
	const width = canvas.clientWidth;
	const height = canvas.clientHeight;

	canvas.width = Math.max(1, Math.floor(width * ratio));
	canvas.height = Math.max(1, Math.floor(height * ratio));
	context.scale(ratio, ratio);
	context.clearRect(0, 0, width, height);

	const barWidth = width / peaks.length;
	const playedBars = progress * peaks.length;
	const styles = getComputedStyle(canvas);
	const playedColor = styles.getPropertyValue('--player-accent');
	const trackColor = styles.getPropertyValue('--player-waveform-track');

	for (const [index, peak] of peaks.entries()) {
		const barHeight = Math.max(1, peak * height);
		const x = index * barWidth;
		const y = (height - barHeight) / 2;

		context.fillStyle = index <= playedBars ? playedColor : trackColor;
		context.fillRect(x, y, Math.max(1, barWidth - 1), barHeight);
	}
}

// The keys `role="slider"` contracts for; anything else falls through to the page
function keyTarget(key: string, currentTimeS: number, durationS: number): number | undefined {
	if (key === 'Home') return 0;
	if (key === 'End') return durationS;

	const step = KEY_STEPS_S.get(key);

	return step === undefined ? undefined : currentTimeS + step;
}
