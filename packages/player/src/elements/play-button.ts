import type { SonicButton } from '@xsynaptic/sonic-ui';

import type { PlayerStore } from '#store/player-types.ts';

import { buttonPart } from '#elements/button-part.ts';
import { legendIcons, renderSonicButton } from '#lib/sonic-button.ts';
import { isAwaitingPlayback } from '#store/selectors.ts';

interface PlayButtonView {
	isDisabled: boolean;
	isPaused: boolean;
	isWaiting: boolean;
}

export const PlayerPlayButton = buttonPart(() => ({
	apply: (button: SonicButton, view: PlayButtonView, labels) => {
		button.disabled = view.isDisabled;
		button.legend = view.isPaused ? 'play' : 'pause';
		button.setAttribute('aria-label', view.isPaused ? labels.play : labels.pause);
		button.toggleAttribute('data-loading', view.isWaiting);
	},
	press: (state) => {
		state.togglePaused();
	},
	render: () =>
		renderSonicButton({
			className: 'player-button-primary',
			icons: legendIcons(['play', 'pause']),
		}),
	select: selectPlayButton,
}));

function selectPlayButton(state: PlayerStore): PlayButtonView {
	return {
		isDisabled: state.queue.length === 0,
		isPaused: state.isPaused,
		isWaiting: isAwaitingPlayback(state),
	};
}
