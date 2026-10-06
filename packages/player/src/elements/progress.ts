import { SonicSlider } from '@xsynaptic/sonic-ui';

import type { PlayerStore } from '#store/player-types.ts';

import { bindBuffered } from '#elements/bind-buffered.ts';
import { bindScrubPreview } from '#elements/bind-scrub-preview.ts';
import { playerContext } from '#elements/player-context.ts';
import { PlayerElement } from '#elements/player-element.ts';
import { formatSpokenPosition } from '#elements/time-slider/spoken-time.ts';
import { bind } from '#lib/bind.ts';
import { requireChild, template } from '#lib/render.ts';
import { isLoaded } from '#store/selectors.ts';

const renderStrip = template(
	/* HTML */ `
		<div class="player-progress">
			<sonic-slider
				double-press="none"
				entry="none"
				key-step="5"
				scrub
				spoken-step="1"
				step="0"
			></sonic-slider>
		</div>
	`,
	HTMLDivElement,
);

export class PlayerProgress extends PlayerElement {
	readonly #strip = renderStrip();

	protected connect(signal: AbortSignal): void {
		const { labels, store } = playerContext(this);

		this.appendOnce(this.#strip);

		const slider = requireChild(this.#strip, 'sonic-slider', SonicSlider);

		slider.setAttribute('aria-label', labels.seek);
		slider.addEventListener(
			'change',
			() => {
				store.getState().seek(slider.value);
			},
			{ signal },
		);

		bind(
			store,
			selectDuration,
			(durationSeconds) => {
				slider.setAttribute('aria-hidden', String(durationSeconds === undefined));
				slider.disabled = durationSeconds === undefined;
				slider.max = durationSeconds ?? 0;
				slider.formatSpokenValue = (seconds) =>
					formatSpokenPosition(labels.seekPosition, seconds, durationSeconds);
			},
			signal,
		);
		bind(
			store,
			(state) => state.currentTimeSeconds,
			(seconds) => {
				slider.value = seconds;
			},
			signal,
		);
		bindBuffered(slider, store, signal);
		bindScrubPreview(slider, store.getState().setScrubPreview, signal);
	}
}

function selectDuration(state: PlayerStore): number | undefined {
	return isLoaded(state) && state.durationSeconds ? state.durationSeconds : undefined;
}
