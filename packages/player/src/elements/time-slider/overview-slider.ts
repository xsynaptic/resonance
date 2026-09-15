import type { StoreApi } from 'zustand/vanilla';

import type {
	OverviewInput,
	OverviewParts,
	OverviewRendering,
} from '#elements/time-slider/overview.ts';
import type { PlayerStore } from '#store/player-types.ts';
import type { PlayerLabels } from '#types.ts';
import type { WaveformRendering } from '#waveform/waveform-render.ts';

import { bindOverview } from '#elements/time-slider/overview.ts';
import { bind } from '#lib/bind.ts';
import { formatSpokenPosition } from '#lib/spoken-time.ts';
import {
	holdDelayMs,
	isSliderKey,
	keyScrubSeconds,
	pixelAt,
	scrubSecondsAt,
} from '#waveform/overview-scrub.ts';
import { paintWaveform } from '#waveform/waveform-render.ts';

export interface Scrub {
	currentSeconds: number;
	holdTimer: ReturnType<typeof setTimeout> | undefined;
	isHeld: boolean;
	// The live binding's, so a hold that outlives a rebind paints through the binding that replaced it
	repaint: (() => void) | undefined;
	// Where the pointer or a repeating key holds the scrub; the release commits it, the way the panel's drag does
	scrubSeconds: number | undefined;
}

export interface SliderInput extends OverviewInput {
	durationSeconds: number | undefined;
	labels: PlayerLabels;
	scrub: Scrub;
	store: StoreApi<PlayerStore>;
}

interface ScrubGesture {
	canvas: HTMLCanvasElement;
	commit: () => void;
	durationSeconds: number;
	overview: OverviewRendering;
	scrub: Scrub;
	seek: (seconds: number) => void;
}

export function bindOverviewSlider(
	parts: OverviewParts,
	input: SliderInput,
	signal: AbortSignal,
): void {
	const { canvas } = parts;
	const { durationSeconds, scrub, store } = input;
	const overview = bindOverview(parts, input, {
		paint: createSliderPaint(canvas, input, scrub),
		signal,
	});
	const seek = (seconds: number): void => {
		store.getState().seek(seconds);
	};

	markSlider(canvas, input);
	scrub.repaint = overview.repaint;
	signal.addEventListener(
		'abort',
		() => {
			scrub.repaint = undefined;
		},
		{ once: true },
	);

	// Nothing to scrub across until the element announces how long the track runs
	if (durationSeconds !== undefined) {
		bindScrub(
			{
				canvas,
				commit: () => {
					clearTimeout(scrub.holdTimer);
					scrub.isHeld = false;

					const seconds = scrub.scrubSeconds;
					if (seconds === undefined) return;

					scrub.scrubSeconds = undefined;
					scrub.currentSeconds = seconds;
					seek(seconds);
					overview.repaint();
				},
				durationSeconds,
				overview,
				scrub,
				seek,
			},
			signal,
		);
	}

	bind(
		store,
		selectTime,
		(seconds) => {
			scrub.currentSeconds = seconds;
			overview.repaint();
		},
		signal,
	);
}

// One per connection, so a gesture outlives the rebind when the element reports a duration of its own
export function createScrub(signal: AbortSignal): Scrub {
	const scrub: Scrub = {
		currentSeconds: 0,
		holdTimer: undefined,
		isHeld: false,
		repaint: undefined,
		scrubSeconds: undefined,
	};

	signal.addEventListener(
		'abort',
		() => {
			resetScrub(scrub);
		},
		{ once: true },
	);

	return scrub;
}

export function resetScrub(scrub: Scrub): void {
	clearTimeout(scrub.holdTimer);
	scrub.holdTimer = undefined;
	scrub.isHeld = false;
	scrub.scrubSeconds = undefined;
}

function bindScrub(gesture: ScrubGesture, signal: AbortSignal): void {
	const { canvas, commit, durationSeconds, overview, scrub } = gesture;

	const scrubToPointer = (event: PointerEvent): void => {
		scrub.scrubSeconds = scrubSecondsAt(
			{ canvas, durationSeconds, rendering: overview.current() },
			event,
		);
		overview.repaint();
	};

	canvas.addEventListener(
		'pointerdown',
		(event) => {
			canvas.setPointerCapture(event.pointerId);
			scrubToPointer(event);
			scrub.holdTimer = setTimeout(() => {
				scrub.isHeld = true;
				scrub.repaint?.();
			}, holdDelayMs);
		},
		{ signal },
	);
	canvas.addEventListener(
		'pointermove',
		(event) => {
			if (event.buttons === 1) scrubToPointer(event);
		},
		{ signal },
	);
	for (const type of ['blur', 'pointercancel', 'pointerup'] as const) {
		canvas.addEventListener(type, commit, { signal });
	}
	canvas.addEventListener(
		'keydown',
		(event) => {
			scrubToKey(gesture, event);
		},
		{ signal },
	);
	canvas.addEventListener(
		'keyup',
		(event) => {
			if (isSliderKey(event.key)) commit();
		},
		{ signal },
	);
}

// Only the edges that land on another device pixel repaint, and only a new whole second is spoken
function createSliderPaint(canvas: HTMLCanvasElement, input: SliderInput, scrub: Scrub) {
	const { durationSeconds, labels } = input;
	let paintedRendering: undefined | WaveformRendering;
	let paintedEdges = '';
	let spokenSeconds = -1;

	return (rendering: WaveformRendering): void => {
		const heldSeconds = scrub.isHeld ? scrub.scrubSeconds : undefined;
		const shownSeconds = Math.floor(heldSeconds ?? scrub.currentSeconds);
		const playedPx = pixelAt(scrub.currentSeconds, durationSeconds, rendering.width) ?? 0;
		const scrubPx = pixelAt(heldSeconds, durationSeconds, rendering.width);
		const edges = `${String(playedPx)}:${String(scrubPx)}`;

		if (rendering !== paintedRendering || edges !== paintedEdges) {
			paintedRendering = rendering;
			paintedEdges = edges;
			paintWaveform(rendering, playedPx, scrubPx);
		}

		if (shownSeconds === spokenSeconds) return;

		spokenSeconds = shownSeconds;
		canvas.setAttribute('aria-valuenow', String(shownSeconds));
		canvas.setAttribute(
			'aria-valuetext',
			formatSpokenPosition(labels.seekPosition, shownSeconds, durationSeconds),
		);
	};
}

function markSlider(canvas: HTMLCanvasElement, { durationSeconds, labels }: SliderInput): void {
	canvas.classList.remove('player-waveform-inert');
	canvas.removeAttribute('aria-hidden');
	canvas.setAttribute('aria-label', labels.seek);
	canvas.setAttribute('aria-valuemax', String(durationSeconds ?? 0));
	canvas.setAttribute('aria-valuemin', '0');
	canvas.setAttribute('role', 'slider');
	canvas.tabIndex = 0;
}

function scrubToKey(gesture: ScrubGesture, event: KeyboardEvent): void {
	const { durationSeconds, overview, scrub, seek } = gesture;
	const seconds = keyScrubSeconds(event, {
		currentSeconds: scrub.currentSeconds,
		durationSeconds,
		scrubSeconds: scrub.scrubSeconds,
	});
	if (seconds === undefined) return;

	event.preventDefault();

	if (!event.repeat) {
		seek(seconds);
		return;
	}

	scrub.scrubSeconds = seconds;
	scrub.isHeld = true;
	overview.repaint();
}

function selectTime(state: PlayerStore): number {
	return state.currentTimeSeconds;
}
