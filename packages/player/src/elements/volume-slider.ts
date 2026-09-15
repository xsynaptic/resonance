import { playerContext } from '#elements/player-context.ts';
import { PlayerElement } from '#elements/player-element.ts';
import { bind } from '#lib/bind.ts';
import { template } from '#lib/render.ts';
import { audibleVolume } from '#store/selectors.ts';

const renderSlider = template(
	'<input class="player-volume-slider" max="1" min="0" step="0.01" type="range">',
	HTMLInputElement,
);

export class PlayerVolumeSlider extends PlayerElement {
	readonly #slider = renderSlider();

	protected connect(signal: AbortSignal): void {
		const { labels, store } = playerContext(this);
		const slider = this.#slider;

		this.appendOnce(slider);
		slider.setAttribute('aria-label', labels.volume);
		slider.addEventListener(
			'input',
			() => {
				store.getState().setVolume(Number(slider.value));
			},
			{ signal },
		);
		bind(
			store,
			audibleVolume,
			(volume) => {
				slider.value = String(volume);
				slider.setAttribute('aria-valuetext', `${String(Math.round(volume * 100))}%`);
				slider.style.setProperty('--player-volume-level', `${String(volume * 100)}%`);
			},
			signal,
		);
	}
}
