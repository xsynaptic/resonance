import type { StoreApi } from 'zustand/vanilla';

import type { PlayerStore } from '#store/player-types.ts';
import type { PlayerLabels } from '#types.ts';
import type { WaveformSpan } from '#waveform/overview/overview-render.ts';

import { playerContext } from '#elements/player-context.ts';
import { PlayerElement } from '#elements/player-element.ts';
import { bufferedKey, bufferedSpans, pointerRatio } from '#elements/time-slider/overview-scrub.ts';
import { bindSliderKeys } from '#elements/time-slider/overview-slider.ts';
import { formatSpokenPosition } from '#elements/time-slider/spoken-time.ts';
import { bind } from '#lib/bind.ts';
import { observeResize } from '#lib/observe-resize.ts';
import { requireChild, template } from '#lib/render.ts';
import { isLoaded } from '#store/selectors.ts';

interface ProgressView {
	currentSeconds: number;
	durationSeconds: number | undefined;
}

interface Strip extends ProgressView {
	pressRect: DOMRect | undefined;
	scrubSeconds: number | undefined;
}

interface StripGesture {
	commit: () => void;
	drop: () => void;
	paint: () => void;
	seek: (seconds: number) => void;
	slider: HTMLDivElement;
	strip: Strip;
}

interface StripParts {
	slider: HTMLDivElement;
	track: HTMLDivElement;
}

const scrubbingAttribute = 'data-scrubbing';

const sliderAttributes = [
	'aria-label',
	'aria-valuemax',
	'aria-valuemin',
	'aria-valuenow',
	'aria-valuetext',
	'role',
	'tabindex',
] as const;

const renderSlider = template(
	'<div class="player-progress"><div class="player-progress-track"></div></div>',
	HTMLDivElement,
);

export class PlayerProgress extends PlayerElement {
	readonly #slider = renderSlider();
	readonly #track = requireChild(this.#slider, '.player-progress-track', HTMLDivElement);

	protected connect(signal: AbortSignal): void {
		const { labels, store } = playerContext(this);
		const parts = { slider: this.#slider, track: this.#track };
		const strip: Strip = {
			currentSeconds: 0,
			durationSeconds: undefined,
			pressRect: undefined,
			scrubSeconds: undefined,
		};
		const paint = createPaint(parts, strip, labels);
		const paintBuffered = createBufferedPaint(parts.track, strip, store);
		const drop = (): void => {
			strip.pressRect = undefined;
			strip.scrubSeconds = undefined;
			paint();
		};
		const seek = (seconds: number): void => {
			store.getState().seek(seconds);
		};

		this.appendOnce(parts.slider);
		bindGesture(
			{
				commit: () => {
					const seconds = strip.scrubSeconds;
					if (seconds === undefined) return;

					strip.currentSeconds = seconds;
					drop();
					seek(seconds);
				},
				drop,
				paint,
				seek,
				slider: parts.slider,
				strip,
			},
			signal,
		);
		observeResize(parts.track, paintBuffered, signal);
		bind(
			store,
			selectMediaElement,
			(element) => {
				element?.addEventListener('progress', paintBuffered, { signal });
			},
			signal,
		);
		bind(
			store,
			selectProgress,
			({ currentSeconds, durationSeconds }) => {
				if (durationSeconds !== strip.durationSeconds) {
					strip.durationSeconds = durationSeconds;
					markSlider(parts.slider, durationSeconds, labels);
					if (durationSeconds === undefined) drop();
				}

				strip.currentSeconds = currentSeconds;
				paint();
				paintBuffered();
			},
			signal,
		);
	}
}

function bindGesture(gesture: StripGesture, signal: AbortSignal): void {
	const { commit, drop, paint, seek, slider, strip } = gesture;
	const scrubToPointer = (event: PointerEvent): void => {
		if (strip.pressRect === undefined || strip.durationSeconds === undefined) return;

		strip.scrubSeconds = pointerRatio(strip.pressRect, event) * strip.durationSeconds;
		paint();
	};

	slider.addEventListener(
		'pointerdown',
		(event) => {
			if (strip.durationSeconds === undefined) return;

			slider.setPointerCapture(event.pointerId);
			strip.pressRect = slider.getBoundingClientRect();
			scrubToPointer(event);
		},
		{ signal },
	);
	slider.addEventListener('pointermove', scrubToPointer, { signal });
	slider.addEventListener('pointerup', commit, { signal });
	// A vertical swipe that starts on the strip scrolls the page and cancels, so it must not seek
	for (const type of ['blur', 'pointercancel'] as const) {
		slider.addEventListener(type, drop, { signal });
	}
	bindSliderKeys(
		slider,
		{
			commit,
			hold: (seconds) => {
				strip.scrubSeconds = seconds;
				paint();
			},
			position: () => keyPosition(strip),
			seek,
		},
		signal,
	);
}

function bufferedGradient(spans: ReadonlyArray<WaveformSpan>, width: number): string {
	if (spans.length === 0) return 'none';

	const stops = spans.map(({ fromPx, toPx }) => {
		const from = `${String((fromPx / width) * 100)}%`;
		const to = `${String((toPx / width) * 100)}%`;

		return `transparent ${from}, var(--player-waveform-buffered) ${from} ${to}, transparent ${to}`;
	});

	return `linear-gradient(to right, ${stops.join(', ')})`;
}

function createBufferedPaint(track: HTMLDivElement, strip: Strip, store: StoreApi<PlayerStore>) {
	let painted = '';

	return (): void => {
		const width = Math.round(track.clientWidth * (window.devicePixelRatio || 1));
		const spans = bufferedSpans(
			store.getState().getMediaElement()?.buffered,
			strip.durationSeconds,
			width,
		);
		const key = `${String(width)}:${bufferedKey(spans)}`;
		if (key === painted) return;

		painted = key;
		track.style.setProperty('--player-progress-buffered', bufferedGradient(spans, width));
	};
}

function createPaint({ slider, track }: StripParts, strip: Strip, labels: PlayerLabels) {
	let spoken = '';

	return (): void => {
		const { currentSeconds, durationSeconds, scrubSeconds } = strip;
		const playedShare = shareOf(currentSeconds, durationSeconds);
		const shownSeconds = Math.floor(scrubSeconds ?? currentSeconds);

		track.style.setProperty('--player-progress', String(playedShare));
		slider.toggleAttribute(scrubbingAttribute, scrubSeconds !== undefined);

		if (scrubSeconds !== undefined) {
			const scrubShare = shareOf(scrubSeconds, durationSeconds);

			track.style.setProperty(
				'--player-progress-scrub-from',
				String(Math.min(playedShare, scrubShare)),
			);
			track.style.setProperty(
				'--player-progress-scrub-to',
				String(Math.max(playedShare, scrubShare)),
			);
		}

		if (durationSeconds === undefined) {
			spoken = '';
			return;
		}

		const key = `${String(shownSeconds)}/${String(durationSeconds)}`;
		if (key === spoken) return;

		spoken = key;
		slider.setAttribute('aria-valuenow', String(shownSeconds));
		slider.setAttribute(
			'aria-valuetext',
			formatSpokenPosition(labels.seekPosition, shownSeconds, durationSeconds),
		);
	};
}

function keyPosition({ currentSeconds, durationSeconds, scrubSeconds }: Strip) {
	if (durationSeconds === undefined) return;

	return { currentSeconds, durationSeconds, scrubSeconds };
}

function markSlider(
	slider: HTMLDivElement,
	durationSeconds: number | undefined,
	labels: PlayerLabels,
): void {
	if (durationSeconds === undefined) {
		for (const name of sliderAttributes) slider.removeAttribute(name);
		return;
	}

	slider.setAttribute('aria-label', labels.seek);
	slider.setAttribute('aria-valuemax', String(durationSeconds));
	slider.setAttribute('aria-valuemin', '0');
	slider.setAttribute('role', 'slider');
	slider.tabIndex = 0;
}

function selectMediaElement(state: PlayerStore): HTMLMediaElement | undefined {
	return state.getMediaElement();
}

function selectProgress(state: PlayerStore): ProgressView {
	return {
		currentSeconds: state.currentTimeSeconds,
		durationSeconds: isLoaded(state) && state.durationSeconds ? state.durationSeconds : undefined,
	};
}

function shareOf(seconds: number, durationSeconds: number | undefined): number {
	if (!durationSeconds) return 0;

	return Math.min(Math.max(seconds / durationSeconds, 0), 1);
}
