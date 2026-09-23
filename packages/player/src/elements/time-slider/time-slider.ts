import type { PlayerContext } from '#elements/player-context.ts';
import type { Scrub } from '#elements/time-slider/overview-slider.ts';
import type { OverviewParts } from '#elements/time-slider/overview.ts';
import type { PlayerStore } from '#store/player-types.ts';
import type { QueueCuePoint } from '#types.ts';

import { playerContext } from '#elements/player-context.ts';
import { PlayerElement } from '#elements/player-element.ts';
import {
	bindOverviewSlider,
	createScrub,
	resetScrub,
} from '#elements/time-slider/overview-slider.ts';
import { bindOverviewPreview } from '#elements/time-slider/overview.ts';
import { bind } from '#lib/bind.ts';
import { requireChild, template } from '#lib/render.ts';
import { supersede } from '#lib/supersede.ts';
import { toDurationSeconds } from '#queue/queue.ts';
import { displayedItem, isLoaded } from '#store/selectors.ts';

interface SliderContext extends PlayerContext {
	scrub: Scrub;
}

interface SliderParts extends OverviewParts {
	frame: HTMLDivElement;
	range: HTMLInputElement;
}

interface SliderView {
	cueDurationSeconds: number | undefined;
	cuePoints: ReadonlyArray<QueueCuePoint> | undefined;
	durationSeconds: number | undefined;
	isLoaded: boolean;
	overview: ReadonlyArray<number> | undefined;
}

// The cue label is hidden from assistive tech: the tracklist carries the same names and the slider the same seeks
const renderFrame = template(
	/* HTML */ `
		<div class="player-waveform-frame">
			<canvas class="player-waveform"></canvas
			><span aria-hidden="true" class="player-cue-label" hidden
				><span class="player-cue-time"></span><span class="player-cue-artist"></span
				><span class="player-cue-title"></span
			></span>
		</div>
	`,
	HTMLDivElement,
);

const renderRange = template(
	'<input class="player-seek" min="0" step="0.1" type="range">',
	HTMLInputElement,
);

export class PlayerTimeSlider extends PlayerElement {
	readonly #parts = renderSliderParts();

	protected connect(signal: AbortSignal): void {
		const context: SliderContext = { ...playerContext(this), scrub: createScrub(signal) };
		const shown = supersede(signal);

		bind(
			context.store,
			selectSlider,
			(view) => {
				this.#show(view, context, shown.next());
			},
			signal,
		);
	}

	// The same nodes stay in place across a new item or duration, so a focused slider keeps its focus
	#show(view: SliderView, context: SliderContext, signal: AbortSignal): void {
		const { frame, range } = this.#parts;
		const shown = view.overview === undefined ? range : frame;

		if (shown.parentNode !== this) this.replaceChildren(shown);
		// A gesture carries across a new duration, never onto a surface that cannot scrub
		if (view.overview === undefined || !view.isLoaded || view.durationSeconds === undefined) {
			resetScrub(context.scrub);
		}

		if (view.overview === undefined) {
			bindRange(range, context, signal);
			return;
		}

		const input = {
			cueDurationSeconds: view.cueDurationSeconds,
			cuePoints: view.cuePoints,
			overview: view.overview,
		};

		if (!view.isLoaded) {
			bindOverviewPreview(this.#parts, input, signal);
			return;
		}

		bindOverviewSlider(
			this.#parts,
			{ ...input, durationSeconds: view.durationSeconds, ...context },
			signal,
		);
	}
}

function bindRange(range: HTMLInputElement, { labels, store }: PlayerContext, signal: AbortSignal) {
	range.setAttribute('aria-label', labels.seek);
	range.addEventListener(
		'input',
		() => {
			store.getState().seek(Number(range.value));
		},
		{ signal },
	);
	bind(
		store,
		selectRange,
		({ durationSeconds, value }) => {
			range.disabled = durationSeconds === undefined;
			range.max = String(durationSeconds ?? 0);
			range.value = String(value);
		},
		signal,
	);
}

function renderSliderParts(): SliderParts {
	const frame = renderFrame();
	const label = requireChild(frame, '.player-cue-label', HTMLSpanElement);

	return {
		artist: requireChild(label, '.player-cue-artist', HTMLSpanElement),
		canvas: requireChild(frame, 'canvas', HTMLCanvasElement),
		frame,
		label,
		range: renderRange(),
		time: requireChild(label, '.player-cue-time', HTMLSpanElement),
		title: requireChild(label, '.player-cue-title', HTMLSpanElement),
	};
}

function selectRange(state: PlayerStore) {
	const { currentTimeSeconds, durationSeconds } = state;

	return {
		durationSeconds,
		value: durationSeconds === undefined ? 0 : Math.min(currentTimeSeconds, durationSeconds),
	};
}

function selectSlider(state: PlayerStore): SliderView {
	const item = displayedItem(state);

	return {
		// The item's own duration, the span its overview's peaks were measured over
		cueDurationSeconds: toDurationSeconds(item),
		cuePoints: item?.cuePoints,
		durationSeconds: state.durationSeconds,
		isLoaded: isLoaded(state),
		overview: item?.waveformOverview,
	};
}
