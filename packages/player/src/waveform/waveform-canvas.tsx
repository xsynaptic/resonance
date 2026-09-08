import type { KeyboardEvent, PointerEvent } from 'react';

import { useEffect, useRef, useSyncExternalStore } from 'react';

import type { SubscribeTime } from '#types.ts';
import type { WaveformRendering } from '#waveform/waveform-render.ts';

import { joinClassNames } from '#lib/class-names.ts';
import { formatClock } from '#lib/format.ts';
import { getThemeVersion, subscribeTheme } from '#waveform/theme-version.ts';
import { paintWaveform, prepareRendering } from '#waveform/waveform-render.ts';

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

interface WaveformCanvasProps {
	className?: string | undefined;
	durationS: number | undefined;
	label: string;
	onSeek: (seconds: number) => void;
	overview: ReadonlyArray<number>;
	subscribeTime: SubscribeTime;
}

export function WaveformCanvas({
	className,
	durationS,
	label,
	onSeek,
	overview,
	subscribeTime,
}: WaveformCanvasProps) {
	const canvasRef = useRef<HTMLCanvasElement>(null);

	// The handlers seek from the position the last paint saw, which is fresher than any render
	const currentTimeRef = useRef(0);

	const themeVersion = useSyncExternalStore(subscribeTheme, getThemeVersion, zeroVersion);

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
				rendering = prepareRendering(canvas, overview);
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
	}, [durationS, overview, subscribeTime, themeVersion]);

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

// The keys `role="slider"` contracts for; anything else falls through to the page
function keyTarget(key: string, currentTimeS: number, durationS: number): number | undefined {
	if (key === 'Home') return 0;
	if (key === 'End') return durationS;

	const step = keyStepsSeconds.get(key);

	return step === undefined ? undefined : currentTimeS + step;
}

function zeroVersion(): number {
	return 0;
}
