import type { SonicButton } from '@xsynaptic/sonic-ui';

import type { PlayerStore } from '#store/player-types.ts';

import { buttonPart } from '#elements/button-part.ts';
import { overlayBodyModule } from '#elements/overlay/overlay-module.ts';
import { bindPreload } from '#lib/bind-preload.ts';
import { cloneIcon } from '#lib/icons.ts';
import { renderSonicButton } from '#lib/sonic-button.ts';

export const PlayerOverlayToggle = buttonPart(() => ({
	apply: (button: SonicButton, isEmpty: boolean) => {
		button.disabled = isEmpty;
	},
	connect: (button, { store }, signal) => {
		bindPreload({ preload: overlayBodyModule.preload, store, trigger: button }, signal);
	},
	label: 'expand',
	press: (state) => {
		state.toggleOverlay();
	},
	render: () => {
		const button = renderSonicButton({
			className: 'player-overlay-toggle',
			icons: [cloneIcon('expand')],
		});

		button.setAttribute('popup', 'dialog');

		return button;
	},
	select: isQueueEmpty,
}));

function isQueueEmpty(state: PlayerStore): boolean {
	return state.queue.length === 0;
}
