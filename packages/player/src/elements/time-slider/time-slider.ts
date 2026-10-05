import { SonicWavestrip } from '@xsynaptic/sonic-ui';

import type { PlayerStore } from '#store/player-types.ts';
import type { PlayerLabels, QueueCuePoint } from '#types.ts';

import { playerContext } from '#elements/player-context.ts';
import { PlayerElement } from '#elements/player-element.ts';
import { formatSpokenPosition } from '#elements/time-slider/spoken-time.ts';
import { bind } from '#lib/bind.ts';
import { formatClock, parseClock } from '#lib/format.ts';
import { requireChild, template } from '#lib/render.ts';
import { toDurationSeconds } from '#queue/queue.ts';
import { displayedItem, isLoaded } from '#store/selectors.ts';
import { toStripMarkers } from '#waveform/cue-markers.ts';
import { cueIndexAt, labelPlacement } from '#waveform/cue-points.ts';

interface Readout {
	cuePoint: QueueCuePoint | undefined;
	hasClock: boolean;
	index: number;
	isAbove: boolean;
	seconds: number;
}

interface StripParts {
	artist: HTMLSpanElement;
	frame: HTMLDivElement;
	label: HTMLSpanElement;
	strip: SonicWavestrip;
	time: HTMLSpanElement;
	title: HTMLSpanElement;
}

interface StripView {
	cueDurationSeconds: number | undefined;
	cuePoints: ReadonlyArray<QueueCuePoint> | undefined;
	durationSeconds: number | undefined;
	isLoaded: boolean;
	overview: ReadonlyArray<number> | undefined;
}

const noCuePoints: ReadonlyArray<QueueCuePoint> = [];

const renderFrame = template(
	/* HTML */ `
		<div class="player-waveform-frame">
			<sonic-wavestrip
				cancellable
				double-press="none"
				fill
				key-step="5"
				spoken-step="1"
				step="0"
			></sonic-wavestrip
			><span aria-hidden="true" class="player-cue-label" hidden
				><span class="player-cue-time"></span><span class="player-cue-artist"></span
				><span class="player-cue-title"></span
			></span>
		</div>
	`,
	HTMLDivElement,
);

export class PlayerTimeSlider extends PlayerElement {
	readonly #frame = renderFrame();

	protected connect(signal: AbortSignal): void {
		const { labels, store } = playerContext(this);
		let shown: StripView | undefined;

		this.appendOnce(this.#frame);

		const parts = readParts(this.#frame);
		const { strip } = parts;

		strip.setAttribute('aria-label', labels.seek);
		strip.formatEntry = formatClock;
		strip.parseValue = parseClock;
		strip.addEventListener(
			'change',
			() => {
				store.getState().seek(strip.value);
			},
			{ signal },
		);

		bind(
			store,
			selectStrip,
			(view) => {
				shown = view;
				showStrip(strip, view, labels);
			},
			signal,
		);
		bind(
			store,
			(state) => state.currentTimeSeconds,
			(seconds) => {
				strip.value = seconds;
			},
			signal,
		);
		bind(
			store,
			(state) => state.getMediaElement(),
			(element) => {
				const showBuffered = (): void => {
					strip.buffered = element?.buffered;
				};

				element?.addEventListener('progress', showBuffered, { signal });
				showBuffered();
			},
			signal,
		);
		bindReadout(parts, () => shown, signal);
		bindScrubPreview(strip, store.getState().setScrubPreview, signal);
	}
}

function bindReadout(
	parts: StripParts,
	readView: () => StripView | undefined,
	signal: AbortSignal,
): void {
	const show = (): void => {
		const view = readView();
		const readout = view && readoutFor(parts.strip, view);

		parts.label.hidden = readout === undefined;
		if (readout) writeReadout(parts, readout);
	};

	for (const type of ['input', 'sonic-hover', 'sonic-reveal']) {
		parts.strip.addEventListener(type, show, { signal });
	}
}

function bindScrubPreview(
	strip: SonicWavestrip,
	preview: PlayerStore['setScrubPreview'],
	signal: AbortSignal,
): void {
	const showPreview = (): void => {
		const isShown = strip.pointerType === 'touch' && strip.matches(':state(revealed)');

		preview(isShown ? strip.value : undefined);
	};

	strip.addEventListener('input', showPreview, { signal });
	strip.addEventListener('sonic-reveal', showPreview, { signal });
	signal.addEventListener(
		'abort',
		() => {
			preview(undefined);
		},
		{ once: true },
	);
}

function isTimed(view: StripView): boolean {
	return view.isLoaded && view.durationSeconds !== undefined;
}

// The lane a dot sits in is private to the strip, so the row is read off the dot itself
function markerRow(strip: SonicWavestrip, index: number): number {
	const dot = strip.querySelectorAll<HTMLElement>('.sonic-wavestrip-marker')[Math.max(0, index)];

	return dot ? dot.offsetTop + dot.offsetHeight / 2 : 0;
}

function isHeld(strip: SonicWavestrip): boolean {
	if (strip.matches(':state(revealed)')) return true;

	return strip.pointerType === 'mouse' && strip.matches(':state(dragging):not(:state(cancelling))');
}

function readoutFor(strip: SonicWavestrip, view: StripView): Readout | undefined {
	const isHolding = isHeld(strip);
	const seconds = isHolding ? strip.value : strip.hoverValue;
	if (seconds === undefined) return undefined;

	const cuePoints = view.cuePoints ?? noCuePoints;
	const index = cueIndexAt(cuePoints, seconds);
	const cuePoint = cuePoints[index];
	const hasClock = isTimed(view);

	// An unloaded strip has no clock to give, and names a Track only on its dot
	if (!hasClock && cuePoint?.startSeconds !== seconds) return undefined;

	return {
		cuePoint,
		hasClock,
		index,
		isAbove: isHolding && strip.pointerType === 'touch',
		seconds,
	};
}

function readParts(frame: HTMLDivElement): StripParts {
	const label = requireChild(frame, '.player-cue-label', HTMLSpanElement);

	return {
		artist: requireChild(label, '.player-cue-artist', HTMLSpanElement),
		frame,
		label,
		strip: requireChild(frame, 'sonic-wavestrip', SonicWavestrip),
		time: requireChild(label, '.player-cue-time', HTMLSpanElement),
		title: requireChild(label, '.player-cue-title', HTMLSpanElement),
	};
}

function selectStrip(state: PlayerStore): StripView {
	const item = displayedItem(state);

	return {
		cueDurationSeconds: toDurationSeconds(item),
		cuePoints: item?.cuePoints,
		durationSeconds: state.durationSeconds,
		isLoaded: isLoaded(state),
		overview: item?.waveformOverview,
	};
}

function showStrip(strip: SonicWavestrip, view: StripView, labels: PlayerLabels): void {
	strip.setAttribute('aria-hidden', String(!isTimed(view)));
	strip.disabled = !isTimed(view);
	strip.max = view.durationSeconds ?? view.cueDurationSeconds ?? 0;
	strip.peaks = view.overview;
	strip.markers = toStripMarkers(view.cuePoints ?? noCuePoints);
	strip.formatSpokenValue = (seconds) =>
		formatSpokenPosition(labels.seekPosition, seconds, view.durationSeconds);
}

function writeReadout(
	{ artist, frame, label, strip, time, title }: StripParts,
	{ cuePoint, hasClock, index, isAbove, seconds }: Readout,
): void {
	// The host is `display: contents`; with no inset and no edge, the frame is the canvas
	const width = frame.clientWidth;
	const x = (seconds / strip.max) * width;
	const { room, side } = labelPlacement(x, width);

	label.toggleAttribute('data-above', isAbove);
	label.dataset.side = side;
	label.style.setProperty('--player-cue-room', `${String(room)}px`);
	label.style.left = `${String(x)}px`;
	label.style.top = `${String(isAbove ? 0 : markerRow(strip, index))}px`;
	artist.textContent = cuePoint?.artistLine ?? '';
	time.textContent = hasClock ? formatClock(seconds) : '';
	title.textContent = cuePoint?.title ?? '';
}
