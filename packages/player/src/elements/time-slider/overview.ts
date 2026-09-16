import type { PlacedCuePoint } from '#waveform/cue-points.ts';
import type { OverviewCues, WaveformRendering } from '#waveform/overview/overview-render.ts';

import { cuePointAtPointer } from '#elements/time-slider/overview-scrub.ts';
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
	title: HTMLSpanElement;
}

export interface OverviewRendering {
	current: () => undefined | WaveformRendering;
	repaint: () => void;
}

interface OverviewBinding {
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
	{ paint, signal }: OverviewBinding,
): OverviewRendering {
	const { canvas } = parts;
	let rendering: undefined | WaveformRendering;
	let hovered: PlacedCuePoint | undefined;

	const show = (placed: PlacedCuePoint | undefined): void => {
		if (placed === hovered) return;

		hovered = placed;
		writeCueLabel(parts, placed, rendering?.ratio ?? 1);
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

			show(cuePointAtPointer(rendering, canvas.getBoundingClientRect(), event));
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
			paintWaveform(rendering, 0);
		},
		signal,
	}).repaint();
}

function writeCueLabel(
	{ artist, label, title }: OverviewParts,
	placed: PlacedCuePoint | undefined,
	ratio: number,
): void {
	label.hidden = placed === undefined;
	if (placed === undefined) return;

	artist.textContent = placed.cuePoint.artistLine;
	title.textContent = placed.cuePoint.title;
	label.dataset.side = placed.side;
	label.style.setProperty('--player-cue-room', `${String(placed.room / ratio)}px`);
	label.style.left = `${String(placed.x / ratio)}px`;
	label.style.top = `${String(placed.y / ratio)}px`;
}
