import type { OverviewReadout } from '#elements/time-slider/overview-readout.ts';
import type { OverviewCues, WaveformRendering } from '#waveform/overview/overview-render.ts';

import { isSameReadout, readoutAtPointer } from '#elements/time-slider/overview-readout.ts';
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
}

interface OverviewBinding {
	// The span the bar scrubs across; without one the readout has no time to show
	durationSeconds?: number | undefined;
	paint: (rendering: WaveformRendering) => void;
	signal: AbortSignal;
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

	const show = (readout: OverviewReadout | undefined): void => {
		if (isSameReadout(shown, readout)) return;

		shown = readout;
		writeReadout(parts, readout, rendering?.ratio ?? 1);
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

			// A fresh rect every move, since the in-flow preview scrolls with the page
			show(
				readoutAtPointer(
					{ durationSeconds, rect: canvas.getBoundingClientRect(), rendering },
					event,
				),
			);
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

	return { current: () => rendering, repaint };
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
	ratio: number,
): void {
	label.hidden = readout === undefined;
	if (readout === undefined) return;

	artist.textContent = readout.cuePoint?.artistLine ?? '';
	time.textContent = readout.seconds === undefined ? '' : formatClock(readout.seconds);
	title.textContent = readout.cuePoint?.title ?? '';
	label.dataset.side = readout.side;
	label.style.setProperty('--player-cue-room', `${String(readout.room / ratio)}px`);
	label.style.left = `${String(readout.x / ratio)}px`;
	label.style.top = `${String(readout.y / ratio)}px`;
}
