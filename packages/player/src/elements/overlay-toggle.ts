import type { PlayerStore } from '#store/player-types.ts';

import { bindPreload } from '#elements/bind-preload.ts';
import { buttonPart } from '#elements/button-part.ts';
import { renderIconButton } from '#elements/icon-button.ts';
import { overlayBodyModule } from '#elements/overlay/overlay-module.ts';

export const PlayerOverlayToggle = buttonPart({
	apply: (button, isEmpty: boolean) => {
		button.disabled = isEmpty;
	},
	connect: (button, { store }, signal) => {
		bindPreload({ preload: overlayBodyModule.preload, store, trigger: button }, signal);
	},
	icon: 'expand',
	label: 'expand',
	press: (state) => {
		state.toggleOverlay();
	},
	render: () => {
		const button = renderIconButton('player-overlay-toggle');

		button.setAttribute('aria-haspopup', 'dialog');

		return button;
	},
	select: isQueueEmpty,
});

function isQueueEmpty(state: PlayerStore): boolean {
	return state.queue.length === 0;
}
