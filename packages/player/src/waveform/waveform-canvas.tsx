import type { KeyboardEvent, PointerEvent, RefObject } from 'react';

import { useEffect, useRef } from 'react';

import type { QueueCuePoint, SubscribeTime } from '#types.ts';
import type { WaveformRendering } from '#waveform/waveform-render.ts';

import { formatClock } from '#lib/format.ts';
import { useOverviewRendering } from '#waveform/use-overview-rendering.tsx';
import { paintWaveform } from '#waveform/waveform-render.ts';

// Coarse for a mix that runs hours, but the steps a slider is expected to answer to
const arrowStepSeconds = 5;
const pageStepSeconds = 60;

// A click seeks without drawing the scrub; only a press held past this shows where the release will land
const holdDelayMs = 150;

const keyStepsSeconds = new Map<string, number>([
	['ArrowDown', -arrowStepSeconds],
	['ArrowLeft', -arrowStepSeconds],
	['ArrowRight', arrowStepSeconds],
	['ArrowUp', arrowStepSeconds],
	['PageDown', -pageStepSeconds],
	['PageUp', pageStepSeconds],
]);

interface HeldScrubOptions {
	currentTimeRef: RefObject<number>;
	durationSeconds: number | undefined;
	isHeldRef: RefObject<boolean>;
	onSeek: (seconds: number) => void;
	overviewRendering: ReturnType<typeof useOverviewRendering>;
	repaintRef: RefObject<(() => void) | undefined>;
	scrubSecondsRef: RefObject<number | undefined>;
}

interface WaveformCanvasProps {
	cueDurationSeconds?: number | undefined;
	cuePoints?: ReadonlyArray<QueueCuePoint> | undefined;
	durationSeconds: number | undefined;
	label: string;
	onSeek: (seconds: number) => void;
	overview: ReadonlyArray<number>;
	subscribeTime: SubscribeTime;
}

export function WaveformCanvas({
	cueDurationSeconds,
	cuePoints,
	durationSeconds,
	label,
	onSeek,
	overview,
	subscribeTime,
}: WaveformCanvasProps) {
	const canvasRef = useRef<HTMLCanvasElement>(null);

	// The handlers seek from the position the last paint saw, which is fresher than any render
	const currentTimeRef = useRef(0);

	// Where the pointer is holding the scrub; the release is what commits it, the way the panel's drag does
	const scrubSecondsRef = useRef<number | undefined>(undefined);
	const isHeldRef = useRef(false);

	// The paint closes over the effect's rendering, so a scrub reaches it through here rather than by re-rendering
	const repaintRef = useRef<(() => void) | undefined>(undefined);

	const overviewRendering = useOverviewRendering({ cueDurationSeconds, cuePoints, overview });
	const { rebuild, themeVersion } = overviewRendering;

	useEffect(() => {
		const canvas = canvasRef.current;
		if (!canvas) return;

		let rendering: undefined | WaveformRendering;
		let painted = '';
		let announced = '';

		const paint = (currentTimeSeconds: number): void => {
			currentTimeRef.current = currentTimeSeconds;

			if (rendering === undefined) {
				rendering = rebuild(canvas);
				if (rendering === undefined) return;

				painted = '';
			}

			const heldSeconds = isHeldRef.current ? scrubSecondsRef.current : undefined;
			const shownSeconds = heldSeconds ?? currentTimeSeconds;
			const playedPx = pixelAt(currentTimeSeconds, durationSeconds, rendering.width) ?? 0;
			const scrubPx = pixelAt(heldSeconds, durationSeconds, rendering.width);
			const paintKey = `${String(playedPx)}:${String(scrubPx)}`;

			// On an hour-long mix a tick moves the edge a fraction of a device pixel, and repainting draws the same image
			if (paintKey !== painted) {
				painted = paintKey;
				paintWaveform(rendering, playedPx, scrubPx);
			}

			const clock = formatClock(shownSeconds);
			if (clock === announced) return;

			announced = clock;
			canvas.setAttribute('aria-valuenow', String(Math.floor(shownSeconds)));
			canvas.setAttribute('aria-valuetext', clock);
		};

		repaintRef.current = () => {
			paint(currentTimeRef.current);
		};

		const observer = new ResizeObserver(() => {
			rendering = undefined;
			paint(currentTimeRef.current);
		});

		observer.observe(canvas);

		const unsubscribe = subscribeTime(paint);

		return () => {
			repaintRef.current = undefined;
			observer.disconnect();
			unsubscribe();
		};
	}, [durationSeconds, rebuild, subscribeTime, themeVersion]);

	const scrubHandlers = useHeldScrub({
		currentTimeRef,
		durationSeconds,
		isHeldRef,
		onSeek,
		overviewRendering,
		repaintRef,
		scrubSecondsRef,
	});

	return (
		<>
			<canvas
				aria-label={label}
				aria-valuemax={durationSeconds ?? 0}
				aria-valuemin={0}
				className="player-waveform"
				onBlur={scrubHandlers.onBlur}
				onKeyDown={scrubHandlers.onKeyDown}
				onKeyUp={scrubHandlers.onKeyUp}
				onPointerCancel={scrubHandlers.onPointerCancel}
				onPointerDown={scrubHandlers.onPointerDown}
				onPointerLeave={overviewRendering.onPointerLeave}
				onPointerMove={scrubHandlers.onPointerMove}
				onPointerUp={scrubHandlers.onPointerUp}
				ref={canvasRef}
				role="slider"
				tabIndex={0}
			/>
			{overviewRendering.label}
		</>
	);
}

function isSliderKey(key: string): boolean {
	return key === 'Home' || key === 'End' || keyStepsSeconds.has(key);
}

// The keys `role="slider"` contracts for; anything else falls through to the page
function keyTarget(
	key: string,
	currentTimeSeconds: number,
	durationSeconds: number,
): number | undefined {
	if (key === 'Home') return 0;
	if (key === 'End') return durationSeconds;

	const step = keyStepsSeconds.get(key);

	return step === undefined ? undefined : currentTimeSeconds + step;
}

function pixelAt(
	seconds: number | undefined,
	durationSeconds: number | undefined,
	width: number,
): number | undefined {
	if (seconds === undefined) return undefined;
	if (!durationSeconds || durationSeconds <= 0) return 0;

	return Math.round(Math.min(1, Math.max(0, seconds / durationSeconds)) * width);
}

function useHeldScrub({
	currentTimeRef,
	durationSeconds,
	isHeldRef,
	onSeek,
	overviewRendering,
	repaintRef,
	scrubSecondsRef,
}: HeldScrubOptions) {
	const holdTimerRef = useRef<number | undefined>(undefined);

	useEffect(
		() => () => {
			window.clearTimeout(holdTimerRef.current);
		},
		[],
	);

	// A press over a cue point lands on its start, so a drag across one snaps to it
	function scrubToPointer(event: PointerEvent<HTMLCanvasElement>): void {
		if (durationSeconds === undefined) return;

		const rect = event.currentTarget.getBoundingClientRect();
		const ratio = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
		const cuePoint = overviewRendering.cuePointAt(event);

		scrubSecondsRef.current = cuePoint?.cuePoint.startSeconds ?? ratio * durationSeconds;
		repaintRef.current?.();
	}

	// Auto-repeat moves the scrub as a held pointer does, so a held key costs one seek on release rather than one per repeat
	function scrubToKey(event: KeyboardEvent<HTMLCanvasElement>): void {
		if (durationSeconds === undefined) return;

		const fromSeconds = event.repeat
			? (scrubSecondsRef.current ?? currentTimeRef.current)
			: currentTimeRef.current;
		const target = keyTarget(event.key, fromSeconds, durationSeconds);
		if (target === undefined) return;

		event.preventDefault();

		const seconds = Math.min(durationSeconds, Math.max(0, target));

		if (!event.repeat) {
			onSeek(seconds);
			return;
		}

		scrubSecondsRef.current = seconds;
		isHeldRef.current = true;
		repaintRef.current?.();
	}

	// A cancelled scrub commits too; snapping back reads as a dropped gesture
	function commitScrub(): void {
		window.clearTimeout(holdTimerRef.current);
		isHeldRef.current = false;

		const seconds = scrubSecondsRef.current;
		if (seconds === undefined) return;

		scrubSecondsRef.current = undefined;
		currentTimeRef.current = seconds;
		onSeek(seconds);
		repaintRef.current?.();
	}

	return {
		onBlur: commitScrub,
		onKeyDown: scrubToKey,
		onKeyUp: (event: KeyboardEvent<HTMLCanvasElement>) => {
			if (isSliderKey(event.key)) commitScrub();
		},
		onPointerCancel: commitScrub,
		onPointerDown: (event: PointerEvent<HTMLCanvasElement>) => {
			event.currentTarget.setPointerCapture(event.pointerId);
			scrubToPointer(event);
			holdTimerRef.current = window.setTimeout(() => {
				isHeldRef.current = true;
				repaintRef.current?.();
			}, holdDelayMs);
		},
		onPointerMove: (event: PointerEvent<HTMLCanvasElement>) => {
			if (event.buttons === 1) scrubToPointer(event);

			overviewRendering.onPointerMove(event);
		},
		onPointerUp: commitScrub,
	};
}
