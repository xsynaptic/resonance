import type { PlayerStore } from '#store/player-types.ts';
import type { PlayerTimeMode } from '#types.ts';

import { bindButton } from '#elements/bind-button.ts';
import { playerContext } from '#elements/player-context.ts';
import { PlayerElement } from '#elements/player-element.ts';
import { bind } from '#lib/bind.ts';
import { formatClock } from '#lib/format.ts';
import { template } from '#lib/render.ts';

interface TimeView {
	isDisabled: boolean;
	timeMode: PlayerTimeMode;
}

const emptyClock = '--:--';

const renderButton = template(
	`<button class="player-time" type="button">${emptyClock}</button>`,
	HTMLButtonElement,
);

export class PlayerTime extends PlayerElement {
	readonly #button = renderButton();

	protected connect(signal: AbortSignal): void {
		const { labels, store } = playerContext(this);
		const button = this.#button;

		this.appendOnce(button);
		bind(
			store,
			selectClock,
			(text) => {
				button.textContent = text;
			},
			signal,
		);
		// The seek surface announces the position, so the button is named for what it does
		button.setAttribute('aria-label', labels.toggleTimeMode);
		bindButton(
			{
				apply: (view) => {
					applyTime(button, view);
				},
				button,
				press: (state) => {
					state.toggleTimeMode();
				},
				select: selectTime,
				store,
			},
			signal,
		);
	}
}

function applyTime(button: HTMLButtonElement, view: TimeView): void {
	button.disabled = view.isDisabled;
	button.dataset.mode = view.timeMode;
	button.setAttribute('aria-pressed', String(view.timeMode === 'remaining'));
}

// Bound apart from the button's attributes, since only the text moves on every tick
function selectClock(state: PlayerStore): string {
	if (state.durationSeconds === undefined) return emptyClock;
	if (state.timeMode === 'remaining') {
		return formatClock(state.currentTimeSeconds - state.durationSeconds);
	}

	return formatClock(state.currentTimeSeconds);
}

function selectTime(state: PlayerStore): TimeView {
	return { isDisabled: state.durationSeconds === undefined, timeMode: state.timeMode };
}
