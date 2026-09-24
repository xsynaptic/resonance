import type { OverviewReadout } from '#elements/time-slider/overview-readout.ts';
import type { OverviewCues, WaveformRendering } from '#waveform/overview/overview-render.ts';

import { isSameReadout, readoutAtPointer } from '#elements/time-slider/overview-readout.ts';
import { isPastCancel } from '#elements/time-slider/overview-scrub.ts';
import { formatClock } from '#lib/format.ts';
import { observeResize } from '#lib/observe-resize.ts';
import { paintWaveform, prepareRendering } from '#waveform/overview/overview-render.ts';
import { subscribeTheme } from '#waveform/theme-change.ts';

export interface OverviewInput extends OverviewCues {
	overview: ReadonlyArray<number>;
}

export interface OverviewParts {
	artist: HTMLSpanElement;
	canvas: HTMLCanvasElement;
	label: HTMLSpanElement;
	time: HTMLSpanElement;
	title: HTMLSpanElement;
}

export interface OverviewRendering {
	current: () => undefined | WaveformRendering;
	repaint: () => void;
	showAbove: (pointer: Pointer | undefined) => void;
}

interface OverviewBinding {
	durationSeconds?: number | undefined;
	paint: (rendering: WaveformRendering) => void;
	signal: AbortSignal;
}

interface Pointer {
	clientX: number;
	clientY: number;
}

const sliderAttributes = [
	'aria-label',
	'aria-valuemax',
	'aria-valuemin',
	'aria-valuenow',
	'aria-valuetext',
	'role',
	'tabindex',
] as const;

export function bindOverview(
	parts: OverviewParts,
	input: OverviewInput,
	{ durationSeconds, paint, signal }: OverviewBinding,
): OverviewRendering {
	const { canvas } = parts;
	let rendering: undefined | WaveformRendering;
	let shown: OverviewReadout | undefined;
	let isShownAbove = false;

	const show = (readout: OverviewReadout | undefined, isAbove = false): void => {
		if (isShownAbove === isAbove && isSameReadout(shown, readout)) return;

		shown = readout;
		isShownAbove = isAbove;
		writeReadout(parts, readout, { isAbove, ratio: rendering?.ratio ?? 1 });
	};
	// A fresh rect every call, since the in-flow preview scrolls with the page
	const readoutAt = (pointer: Pointer): OverviewReadout | undefined => {
		const rect = canvas.getBoundingClientRect();
		if (isPastCancel(rect, pointer)) return undefined;

		return readoutAtPointer({ durationSeconds, rect, rendering }, pointer);
	};
	const repaint = (): void => {
		if (rendering === undefined) rendering = prepareRendering(canvas, input.overview, input);
		if (rendering !== undefined) paint(rendering);
	};
	const invalidate = (): void => {
		rendering = undefined;
		show(undefined);
		repaint();
	};
	const unsubscribeTheme = subscribeTheme(invalidate);

	observeResize(canvas, invalidate, signal);
	canvas.addEventListener(
		'pointermove',
		(event) => {
			if (event.pointerType === 'touch') return;

			show(readoutAt(event));
		},
		{ signal },
	);
	canvas.addEventListener(
		'pointerleave',
		() => {
			show(undefined);
		},
		{ signal },
	);
	signal.addEventListener(
		'abort',
		() => {
			unsubscribeTheme();
			show(undefined);
		},
		{ once: true },
	);

	return {
		current: () => rendering,
		repaint,
		showAbove: (pointer) => {
			// A hold timer can outlive the binding it was started under
			if (signal.aborted) return;

			show(pointer === undefined ? undefined : readoutAt(pointer), true);
		},
	};
}

export function bindOverviewPreview(
	parts: OverviewParts,
	input: OverviewInput,
	signal: AbortSignal,
): void {
	const { canvas } = parts;

	for (const name of sliderAttributes) canvas.removeAttribute(name);
	canvas.classList.add('player-waveform-inert');
	canvas.setAttribute('aria-hidden', 'true');
	bindOverview(parts, input, {
		paint: (rendering) => {
			paintWaveform(rendering, { playedPx: 0 });
		},
		signal,
	}).repaint();
}

function writeReadout(
	{ artist, label, time, title }: OverviewParts,
	readout: OverviewReadout | undefined,
	{ isAbove, ratio }: { isAbove: boolean; ratio: number },
): void {
	label.hidden = readout === undefined;
	if (readout === undefined) return;

	label.toggleAttribute('data-above', isAbove);
	artist.textContent = readout.cuePoint?.artistLine ?? '';
	time.textContent = readout.seconds === undefined ? '' : formatClock(readout.seconds);
	title.textContent = readout.cuePoint?.title ?? '';
	label.dataset.side = readout.side;
	label.style.setProperty('--player-cue-room', `${String(readout.room / ratio)}px`);
	label.style.left = `${String(readout.x / ratio)}px`;
	label.style.top = isAbove ? '0px' : `${String(readout.y / ratio)}px`;
}
