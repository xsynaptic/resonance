import type { PlayerStore } from '#store/player-types.ts';

import { buttonPart } from '#elements/button-part.ts';
import { cloneIcon } from '#lib/icons.ts';
import { template } from '#lib/render.ts';
import { isAwaitingPlayback } from '#store/selectors.ts';

interface PlayButtonView {
	isDisabled: boolean;
	isPaused: boolean;
	isWaiting: boolean;
}

const playButtonAttributes = {
	isPaused: 'data-paused',
	isWaiting: 'data-loading',
} as const satisfies Partial<Record<keyof PlayButtonView, `data-${string}`>>;

const renderButton = template(
	'<button class="player-button player-button-primary" type="button"></button>',
	HTMLButtonElement,
);

export const PlayerPlayButton = buttonPart(() => ({
	apply: (button, view: PlayButtonView, labels) => {
		button.disabled = view.isDisabled;
		button.setAttribute('aria-label', view.isPaused ? labels.play : labels.pause);
		button.toggleAttribute(playButtonAttributes.isPaused, view.isPaused);
		button.toggleAttribute(playButtonAttributes.isWaiting, view.isWaiting);
		button.replaceChildren(cloneIcon(view.isPaused ? 'play' : 'pause'));
	},
	press: (state) => {
		state.togglePaused();
	},
	render: renderButton,
	select: selectPlayButton,
}));

function selectPlayButton(state: PlayerStore): PlayButtonView {
	return {
		isDisabled: state.queue.length === 0,
		isPaused: state.isPaused,
		isWaiting: isAwaitingPlayback(state),
	};
}
